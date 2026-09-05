import itertools
import json
import re
from pathlib import Path

import numpy as np
import pytest

from renderer_service.config import settings
from renderer_service.models import BatchVariant, LayerIdentifier
from renderer_service.renderer.coat_patterns import (
    COAT_PATTERN_NAMES,
    apply_coat_pattern,
    normalize_coat_pattern_name,
    required_source_pelts,
)
from renderer_service.renderer.document_schema import InvalidCatDocument
from renderer_service.renderer.image_ops import apply_mask
from renderer_service.renderer.pipeline import RenderPipeline
from renderer_service.renderer.repository import SpriteRepository
from renderer_service.renderer.sprite_mapper import SpriteMapper

DATA_DIR = settings.data_root
FRONTEND_CATALOG = (
    Path(__file__).resolve().parents[3]
    / "frontend"
    / "lib"
    / "cat-v3"
    / "coatPatterns.ts"
)
DISCORD_PUBLIC_CATALOG = (
    Path(__file__).resolve().parents[3]
    / "backend"
    / "discord-bot"
    / "src"
    / "generated"
    / "public-cat-catalog.json"
)
PAGE_POSES = ("adult_short0", "adult_short1", "adult_short2")
PAGE_COLOURS = ("GOLDEN", "GINGER", "LIGHTBROWN", "BROWN", "SILVER")
MINIMUM_PATTERN_DELTA_RATIO = 0.2


def _pelt_sources(
    repository: SpriteRepository,
    mapper: SpriteMapper,
    pattern_name: str,
    *,
    pose_name: str = "adult_short1",
    colour: str = "GOLDEN",
):
    flat_name = mapper.build_sprite_name("pelt", "SingleColour", colour)
    assert flat_name is not None
    flat = repository.get_sprite(flat_name, 0, pose_name)

    sources = {}
    for pelt_name in required_source_pelts(pattern_name):
        sprite_name = mapper.build_sprite_name("pelt", pelt_name, colour)
        assert sprite_name is not None
        sources[pelt_name] = repository.get_sprite(sprite_name, 0, pose_name)
    return flat, sources


def test_coat_pattern_catalog_has_twenty_unique_entries():
    assert len(COAT_PATTERN_NAMES) == 20
    assert len(set(COAT_PATTERN_NAMES)) == 20
    assert "bengal-rosettes" in COAT_PATTERN_NAMES
    assert "jaguar-mosaic" in COAT_PATTERN_NAMES

    for pattern_name in COAT_PATTERN_NAMES:
        assert required_source_pelts(pattern_name)


def test_frontend_catalog_matches_renderer_catalog():
    source = FRONTEND_CATALOG.read_text()
    entries = re.findall(
        r'id: "([^"]+)"[\s\S]*?sourcePelts: \[([^\]]*)\]',
        source,
    )
    frontend_catalog = {
        pattern_id: tuple(re.findall(r'"([^"]+)"', source_pelts))
        for pattern_id, source_pelts in entries
    }

    assert tuple(frontend_catalog) == COAT_PATTERN_NAMES
    assert frontend_catalog == {
        pattern_name: required_source_pelts(pattern_name)
        for pattern_name in COAT_PATTERN_NAMES
    }


def test_discord_catalog_matches_renderer_catalog():
    catalog = json.loads(DISCORD_PUBLIC_CATALOG.read_text())
    discord_pattern_ids = tuple(
        entry["id"] for entry in catalog["catalogs"]["coatPatterns"]
    )

    assert discord_pattern_ids == COAT_PATTERN_NAMES


def test_apply_coat_pattern_preserves_alpha():
    repository = SpriteRepository()
    mapper = SpriteMapper(DATA_DIR)
    flat, sources = _pelt_sources(repository, mapper, "bengal-rosettes")

    patterned = apply_coat_pattern(flat, "bengal-rosettes", flat, sources)

    assert patterned.getchannel("A").tobytes() == flat.getchannel("A").tobytes()
    assert patterned.tobytes() != flat.tobytes()


def test_patterns_only_reuse_pixels_from_matching_pose_frames():
    repository = SpriteRepository()
    mapper = SpriteMapper(DATA_DIR)

    for pose_name in repository.pose_names:
        for pattern_name in COAT_PATTERN_NAMES:
            flat, sources = _pelt_sources(
                repository,
                mapper,
                pattern_name,
                pose_name=pose_name,
            )
            patterned = apply_coat_pattern(flat, pattern_name, flat, sources)
            flat_pixels = np.asarray(flat, dtype=np.uint8)
            patterned_pixels = np.asarray(patterned, dtype=np.uint8)
            changed = np.any(
                patterned_pixels[..., :3] != flat_pixels[..., :3],
                axis=-1,
            )

            assert np.any(changed)
            assert not np.any(changed & (flat_pixels[..., 3] == 0))

            matches_a_source = np.zeros(changed.shape, dtype=bool)
            for source in sources.values():
                source_pixels = np.asarray(source, dtype=np.uint8)
                matches_a_source |= np.all(
                    patterned_pixels[..., :3] == source_pixels[..., :3],
                    axis=-1,
                )
            assert np.all(matches_a_source[changed])


def test_every_pattern_is_visible_for_every_pose_and_colour():
    repository = SpriteRepository()
    mapper = SpriteMapper(DATA_DIR)

    for pose_name, colour, pattern_name in itertools.product(
        repository.pose_names,
        mapper.colours,
        COAT_PATTERN_NAMES,
    ):
        flat, sources = _pelt_sources(
            repository,
            mapper,
            pattern_name,
            pose_name=pose_name,
            colour=colour,
        )
        patterned = apply_coat_pattern(flat, pattern_name, flat, sources)

        assert patterned.tobytes() != flat.tobytes(), (
            f"{pattern_name} disappeared for {pose_name}/{colour}"
        )


def test_all_coat_patterns_render_distinct_cats():
    pipeline = RenderPipeline(repository=SpriteRepository())
    params = {
        "poseName": "adult_short1",
        "peltName": "SingleColour",
        "colour": "GOLDEN",
        "eyeColour": "PALEGREEN",
        "skinColour": "DARKBROWN",
        "shading": True,
    }
    base = pipeline.render(params, collect_layers=False).composed
    rendered_bytes: set[bytes] = set()

    for pattern_name in COAT_PATTERN_NAMES:
        result = pipeline.render(
            {**params, "coatPattern": pattern_name}, collect_layers=True
        )
        layer = next(
            item for item in result.layers if item.id == LayerIdentifier.coat_pattern
        )

        assert layer.diagnostics == [f"coat-pattern:{pattern_name}"]
        assert result.composed.tobytes() != base.tobytes()
        assert (
            result.composed.getchannel("A").tobytes() == base.getchannel("A").tobytes()
        )
        rendered_bytes.add(result.composed.tobytes())

    assert len(rendered_bytes) == len(COAT_PATTERN_NAMES)


def test_coat_pattern_stays_beneath_tortie_layers():
    pipeline = RenderPipeline(repository=SpriteRepository())
    params = {
        "poseName": "adult_short1",
        "peltName": "SingleColour",
        "colour": "GOLDEN",
        "eyeColour": "PALEGREEN",
        "skinColour": "DARKBROWN",
        "isTortie": True,
        "tortie": [
            {"pattern": "Tabby", "colour": "BLACK", "mask": "ONE"},
        ],
    }
    without_tortie = {**params, "isTortie": False, "tortie": []}

    flat = np.asarray(pipeline.render(without_tortie).composed, dtype=np.uint8)
    tortie = np.asarray(
        pipeline.render(params, collect_layers=False).composed,
        dtype=np.uint8,
    )
    patterned_tortie = np.asarray(
        pipeline.render(
            {**params, "coatPattern": "bengal-rosettes"},
            collect_layers=False,
        ).composed,
        dtype=np.uint8,
    )

    tortie_layer = pipeline.renderer._build_pelt_layer("Tabby", "BLACK", params)
    tortie_mask = pipeline.renderer._load_tortie_mask("ONE", params)
    assert tortie_layer is not None
    assert tortie_mask is not None
    tortie_pixels = (
        np.asarray(
            apply_mask(tortie_layer, tortie_mask).getchannel("A"),
            dtype=np.uint8,
        )
        > 0
    )
    base_pixels = (flat[..., 3] > 0) & ~tortie_pixels

    assert np.any(tortie_pixels)
    assert np.array_equal(patterned_tortie[tortie_pixels], tortie[tortie_pixels])
    assert np.any(patterned_tortie[base_pixels, :3] != tortie[base_pixels, :3])


def test_coat_pattern_supports_legacy_single_tortie_fields():
    pipeline = RenderPipeline(repository=SpriteRepository())
    shared = {
        "poseName": "adult_short1",
        "peltName": "SingleColour",
        "coatPattern": "bengal-rosettes",
        "colour": "GOLDEN",
        "eyeColour": "PALEGREEN",
        "skinColour": "DARKBROWN",
        "isTortie": True,
    }

    layered = pipeline.render(
        {
            **shared,
            "tortie": [
                {"pattern": "Tabby", "colour": "BLACK", "mask": "ONE"},
            ],
        }
    ).composed
    legacy = pipeline.render(
        {
            **shared,
            "tortiePattern": "Tabby",
            "tortieColour": "BLACK",
            "tortieMask": "ONE",
        }
    ).composed

    assert legacy.tobytes() == layered.tobytes()


def test_page_patterns_stay_visually_distinct_across_controls():
    pipeline = RenderPipeline(repository=SpriteRepository())

    for pose_name, colour in itertools.product(PAGE_POSES, PAGE_COLOURS):
        params = {
            "poseName": pose_name,
            "peltName": "SingleColour",
            "colour": colour,
            "eyeColour": "PALEGREEN",
            "skinColour": "DARKBROWN",
            "shading": True,
        }
        base = np.asarray(
            pipeline.render(params, collect_layers=False).composed,
            dtype=np.uint8,
        )
        rendered: dict[str, np.ndarray] = {}
        marking_counts: dict[str, int] = {}

        for pattern_name in COAT_PATTERN_NAMES:
            pixels = np.asarray(
                pipeline.render(
                    {**params, "coatPattern": pattern_name},
                    collect_layers=False,
                ).composed,
                dtype=np.uint8,
            )
            rendered[pattern_name] = pixels
            marking_counts[pattern_name] = int(
                np.any(pixels[..., :3] != base[..., :3], axis=-1).sum()
            )
            assert marking_counts[pattern_name] > 0

        for first_name, second_name in itertools.combinations(
            COAT_PATTERN_NAMES,
            2,
        ):
            differing_pixels = int(
                np.any(
                    rendered[first_name][..., :3] != rendered[second_name][..., :3],
                    axis=-1,
                ).sum()
            )
            minimum_delta = (
                min(marking_counts[first_name], marking_counts[second_name])
                * MINIMUM_PATTERN_DELTA_RATIO
            )
            assert differing_pixels >= minimum_delta, (
                f"{first_name} and {second_name} are too similar for "
                f"{pose_name}/{colour}: {differing_pixels} differing pixels"
            )


def test_unknown_coat_pattern_is_rejected_by_the_generated_contract():
    pipeline = RenderPipeline(repository=SpriteRepository())
    params = {
        "poseName": "adult_short1",
        "peltName": "SingleColour",
        "colour": "GOLDEN",
    }

    assert normalize_coat_pattern_name("not-a-pattern") is None
    assert required_source_pelts("not-a-pattern") == ()
    with pytest.raises(InvalidCatDocument, match="coatPattern"):
        pipeline.render({**params, "coatPattern": "not-a-pattern"}, collect_layers=True)


def test_legacy_pelt_name_is_normalized_to_a_coat_pattern():
    pipeline = RenderPipeline(repository=SpriteRepository())
    params = {
        "poseName": "adult_short1",
        "peltName": "bengal-rosettes",
        "colour": "GOLDEN",
    }

    legacy = pipeline.render(params, collect_layers=True)
    canonical = pipeline.render(
        {
            **params,
            "peltName": "SingleColour",
            "coatPattern": "bengal-rosettes",
        },
        collect_layers=True,
    )

    assert legacy.composed.tobytes() == canonical.composed.tobytes()
    assert LayerIdentifier.coat_pattern in [layer.id for layer in legacy.layers]


def test_batch_variant_explicit_null_clears_base_coat_pattern():
    pipeline = RenderPipeline(repository=SpriteRepository())
    base_params = {
        "poseName": "adult_short1",
        "peltName": "SingleColour",
        "coatPattern": "bengal-rosettes",
        "colour": "GOLDEN",
    }
    variants = [
        BatchVariant(
            id="params-normal-pelt",
            params={"peltName": "Tabby", "coatPattern": None},
        ),
        BatchVariant(
            id="overrides-normal-pelt",
            overrides={"peltName": "Tabby", "coatPattern": None},
        ),
    ]

    batch = pipeline.render_batch(
        base_params,
        variants,
        include_base=False,
        include_sources=True,
    )
    expected = pipeline.render(
        {**base_params, "peltName": "Tabby", "coatPattern": None},
        collect_layers=False,
    ).composed

    assert [source[0] for source in batch.sources] == [
        "params-normal-pelt",
        "overrides-normal-pelt",
    ]
    assert all(source[1].tobytes() == expected.tobytes() for source in batch.sources)


def test_batch_variant_normal_pelt_clears_inherited_coat_pattern():
    pipeline = RenderPipeline(repository=SpriteRepository())
    base_params = {
        "poseName": "adult_short1",
        "peltName": "SingleColour",
        "coatPattern": "bengal-rosettes",
        "colour": "GOLDEN",
    }
    variants = [
        BatchVariant(id="params-normal-pelt", params={"peltName": "Tabby"}),
        BatchVariant(id="overrides-normal-pelt", overrides={"peltName": "Tabby"}),
    ]

    batch = pipeline.render_batch(
        base_params,
        variants,
        include_base=False,
        include_sources=True,
    )
    expected = pipeline.render(
        {**base_params, "peltName": "Tabby", "coatPattern": None},
        collect_layers=False,
    ).composed

    assert [source[0] for source in batch.sources] == [
        "params-normal-pelt",
        "overrides-normal-pelt",
    ]
    assert all(source[1].tobytes() == expected.tobytes() for source in batch.sources)


def test_batch_variant_normalizes_a_legacy_coat_pattern_override():
    pipeline = RenderPipeline(repository=SpriteRepository())
    base_params = {
        "poseName": "adult_short1",
        "peltName": "SingleColour",
        "coatPattern": "bengal-rosettes",
        "colour": "GOLDEN",
    }
    variants = [
        BatchVariant(id="legacy-params", params={"peltName": "tiger-stripes"}),
        BatchVariant(id="legacy-overrides", overrides={"peltName": "tiger-stripes"}),
    ]

    batch = pipeline.render_batch(
        base_params,
        variants,
        include_base=False,
        include_sources=True,
    )
    expected = pipeline.render(
        {**base_params, "coatPattern": "tiger-stripes"},
        collect_layers=False,
    ).composed

    assert [source[0] for source in batch.sources] == [
        "legacy-params",
        "legacy-overrides",
    ]
    assert all(source[1].tobytes() == expected.tobytes() for source in batch.sources)
