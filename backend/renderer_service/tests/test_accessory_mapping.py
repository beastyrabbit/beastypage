from pathlib import Path

from renderer_service.renderer.sprite_mapper import SpriteMapper
from renderer_service.renderer.repository import SpriteRepository


def test_all_accessories_have_sprites():
    mapper = SpriteMapper(Path("renderer_service/data"))
    repo = SpriteRepository()

    missing = []
    for name in mapper.accessories:
        sprite_name = mapper.accessory_sprite_name(name)
        if not sprite_name or not repo.has_sprite(sprite_name, 8):
            missing.append((name, sprite_name))

    assert not missing, f"Accessories without sprites: {missing[:10]} (total {len(missing)})"
