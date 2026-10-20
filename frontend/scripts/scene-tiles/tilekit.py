"""Shared helpers for Scene Planner tile builders.

Coordinate contract (read this before writing a builder):

- One grid cell is one Blender unit. The tile being rendered is the square
  x in [0, 1], z in [0, 1]. +x is east (right), +z is north (up the picture).
- The camera is orthographic and looks along +y from the front, so -y is
  towards the viewer. Keep geometry within y in [-4, 4].
- Neighbour cells sit next to the tile: east is x in [1, 2], north is
  z in [1, 2], and so on. Build what the neighbourhood implies and let the
  camera crop it: in a direction with a neighbour, geometry continues past the
  frame; in a direction without one, the element ends inside this cell with a
  finished edge.
- Tiles are reused anywhere on the board, so everything that crosses an open
  side must repeat with a period of exactly 1 unit (use x % 1, sin(2*pi*x)).
  Animation loops: frame `t` runs from 0 to 1 and t=1 must look like t=0.
- The output is 16 x 16 pixels, so 1 px = 1/16 unit. Details thinner than
  that disappear; bold silhouettes and 2-3 tones per surface read best.
- The background stays transparent. The renderer paints sky and meadow
  behind tiles and tints them for time of day, season and haze, so build
  everything in plain daylight colours.
"""

from __future__ import annotations

import math
import random

import bpy
import numpy as np

# The Scene Planner's base colours (lib/scene-planner/render.ts BASE).
BASE = {
    "meadow": "#4f9a46",
    "grass": "#3f8a3a",
    "grassLight": "#66b94f",
    "farLand": "#6d8f6a",
    "foliageDark": "#2d5e2f",
    "foliage": "#3f7d3a",
    "foliageLight": "#5fa04a",
    "trunk": "#5b3a25",
    "rock": "#6b6f7c",
    "rockLight": "#9097a6",
    "rockDark": "#474b57",
    "water": "#3a78c2",
    "waterLight": "#8cc8f0",
    "waterDark": "#24508a",
    "foam": "#e6f4ff",
    "sand": "#e3c58c",
    "sandDark": "#c9a66b",
    "dirt": "#a07c52",
    "dirtLight": "#c29d6c",
    "asphalt": "#4a4e5a",
    "paint": "#e8e2c8",
    "built": "#6a6f86",
    "builtLight": "#8d93ab",
    "builtDark": "#4b4f63",
    "roof": "#a8504a",
    "wood": "#8a5a34",
    "woodLight": "#b07a48",
    "red": "#d9534f",
    "white": "#eef1f6",
    "snow": "#e4ebf5",
    "cloud": "#f2f4fa",
    "cloudShade": "#c6cbe0",
    "petal1": "#f472b6",
    "petal2": "#facc15",
    "petal3": "#c4b5fd",
    "glow": "#ffd27a",
}

N, E, S, W = 1, 2, 4, 8
SIDE_BITS = {"N": N, "E": E, "S": S, "W": W}

RIG = "tilekit-rig"


def rgb(hex_value: str) -> tuple[float, float, float]:
    n = int(hex_value.lstrip("#"), 16)
    return ((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255


def shade(hex_value: str, factor: float) -> str:
    r, g, b = rgb(hex_value)
    f = lambda c: max(0, min(255, round(c * 255 * factor)))  # noqa: E731
    return f"#{f(r):02x}{f(g):02x}{f(b):02x}"


def ramp(*names: str) -> list[str]:
    """Palette with every named base colour plus a darker and a lighter step."""
    out: list[str] = []
    for name in names:
        value = BASE.get(name, name)
        out += [shade(value, 0.72), value, shade(value, 1.22)]
    return out


# Default palette: every base colour with a shade on each side.
GLOBAL_PALETTE = ramp(*BASE.keys())


def _srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def linear(hex_value: str) -> tuple[float, float, float, float]:
    r, g, b = rgb(hex_value)
    return (_srgb_to_linear(r), _srgb_to_linear(g), _srgb_to_linear(b), 1.0)


# ---------------------------------------------------------------------------
# Tile parameters
# ---------------------------------------------------------------------------


class Tile:
    """What a builder is asked to draw. Read its fields; do not mutate."""

    def __init__(self, job: dict, frame: int):
        self.kind: str = job["kind"]
        self.key: str = job["key"]
        self.params: dict = job["params"]
        self.frames: int = job["frames"]
        self.frame = frame
        #: Animation phase in [0, 1); loops back to 0.
        self.t = frame / max(1, job["frames"])
        p = self.params
        self.element: str = p.get("element", "")
        self.shape: str = p.get("shape", "")
        mask = int(p.get("mask", 0))
        #: Paths only: the cell lies inside a stretch two or more cells wide.
        #: Fill it with the surface (water, dirt, asphalt) edge to edge with
        #: no banks, kerbs or corner cut-outs; it meets mask-15 neighbours.
        self.fill = mask == 16
        self.mask: int = 15 if self.fill else mask
        self.variant: str = p.get("variant", "base")
        self.alt: int = int(p.get("alt", 0))
        #: Edge and combo tiles: the receiving cell's side the source touches.
        self.side: str = p.get("side", "")
        self.source: str = p.get("from", p.get("combo", ""))
        self.onto: str = p.get("onto", "")
        self.combo: str = p.get("combo", "")
        #: Ground tiles: "far", "mid" or "front".
        self.zone: str = p.get("zone", "")
        self.seed = _hash(f"{self.kind}:{self.params.get('element', '')}:{self.alt}")

    @property
    def n(self) -> bool:
        return bool(self.mask & N)

    @property
    def e(self) -> bool:
        return bool(self.mask & E)

    @property
    def s(self) -> bool:
        return bool(self.mask & S)

    @property
    def w(self) -> bool:
        return bool(self.mask & W)

    def has(self, dx: int, dz: int) -> bool:
        """Whether the cell at (dx, dz) belongs to the same group.

        dx is +1 east, dz is +1 north. Diagonals count as present when both
        sides next to them are, the usual 4-neighbour auto-tiling guess.
        """
        if dx == 0 and dz == 0:
            return True
        horizontal = {1: self.e, -1: self.w, 0: True}[dx]
        vertical = {1: self.n, -1: self.s, 0: True}[dz]
        return horizontal and vertical

    def rng(self, salt: str = "") -> random.Random:
        """Deterministic random numbers for this tile (not for open edges)."""
        return random.Random(_hash(f"{self.key}:{salt}"))


def _hash(text: str) -> int:
    h = 2166136261
    for ch in text.encode():
        h = ((h ^ ch) * 16777619) & 0xFFFFFFFF
    return h


# ---------------------------------------------------------------------------
# Scene
# ---------------------------------------------------------------------------


def setup_scene(size: int, threads: int = 4):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    # Enough samples that noise does not snap to speckled palette pixels.
    scene.cycles.samples = 96
    scene.cycles.use_denoising = False
    scene.cycles.max_bounces = 3
    scene.render.threads_mode = "FIXED"
    scene.render.threads = threads
    scene.render.resolution_x = size
    scene.render.resolution_y = size
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.filter_size = 0.6
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1

    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)

    world = scene.world or bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.55, 0.58, 0.66, 1)
    background.inputs["Strength"].default_value = 0.55

    camera = bpy.data.objects.new(RIG + "-camera", bpy.data.cameras.new(RIG))
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 1
    camera.data.clip_start = 0.1
    camera.data.clip_end = 60
    camera.location = (0.5, -20, 0.5)
    camera.rotation_euler = (math.pi / 2, 0, 0)
    scene.collection.objects.link(camera)
    scene.camera = camera

    # Key light from the upper left, in front of the picture.
    sun = bpy.data.objects.new(RIG + "-sun", bpy.data.lights.new(RIG + "-sun", "SUN"))
    sun.data.energy = 3.2
    sun.data.angle = math.radians(8)
    sun.rotation_euler = (math.radians(50), math.radians(-35), math.radians(-25))
    scene.collection.objects.link(sun)


def clear():
    """Removes everything a builder made, keeping camera and lights."""
    for obj in list(bpy.data.objects):
        if not obj.name.startswith(RIG):
            bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    for curve in list(bpy.data.curves):
        if curve.users == 0:
            bpy.data.curves.remove(curve)


# ---------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------

_materials: dict[str, bpy.types.Material] = {}


def _principled(material: bpy.types.Material):
    if hasattr(material, "use_nodes"):
        material.use_nodes = True
    return material.node_tree.nodes.get("Principled BSDF")


def mat(color: str, rough: float = 0.85, metal: float = 0.0) -> bpy.types.Material:
    """Plain surface in a base colour name ("water") or hex ("#3a78c2")."""
    value = BASE.get(color, color)
    name = f"tk-{value}-{rough:.2f}-{metal:.2f}"
    if name in _materials:
        return _materials[name]
    material = bpy.data.materials.new(name)
    node = _principled(material)
    node.inputs["Base Color"].default_value = linear(value)
    node.inputs["Roughness"].default_value = rough
    node.inputs["Metallic"].default_value = metal
    _materials[name] = material
    return material


def glow(color: str = "glow", strength: float = 6.0) -> bpy.types.Material:
    """Self-lit surface, such as a lit window. It stays bright at night: the
    renderer draws glow pixels after darkening the tile for the time of day."""
    value = BASE.get(color, color)
    name = f"tk-glow-{value}-{strength:.1f}"
    if name in _materials:
        return _materials[name]
    material = bpy.data.materials.new(name)
    node = _principled(material)
    node.inputs["Base Color"].default_value = linear(value)
    node.inputs["Emission Color"].default_value = linear(value)
    node.inputs["Emission Strength"].default_value = strength
    material["glow"] = value
    _materials[name] = material
    return material


def transparent(color: str, alpha: float) -> bpy.types.Material:
    """See-through surface (spray, mist, glass). Quantised to on/off pixels."""
    value = BASE.get(color, color)
    name = f"tk-alpha-{value}-{alpha:.2f}"
    if name in _materials:
        return _materials[name]
    material = bpy.data.materials.new(name)
    node = _principled(material)
    node.inputs["Base Color"].default_value = linear(value)
    node.inputs["Alpha"].default_value = alpha
    _materials[name] = material
    return material


# ---------------------------------------------------------------------------
# Geometry
# ---------------------------------------------------------------------------


def _link(obj: bpy.types.Object, material: bpy.types.Material | None):
    bpy.context.scene.collection.objects.link(obj)
    if material is not None:
        obj.data.materials.append(material)
    return obj


def mesh(
    verts: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
    material: bpy.types.Material | None = None,
    smooth: bool = False,
    name: str = "tk",
) -> bpy.types.Object:
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts, [], faces)
    data.update()
    if smooth:
        for poly in data.polygons:
            poly.use_smooth = True
    return _link(bpy.data.objects.new(name, data), material)


def box(
    x0: float,
    z0: float,
    x1: float,
    z1: float,
    material: bpy.types.Material,
    y0: float = -0.25,
    y1: float = 0.25,
) -> bpy.types.Object:
    """Axis-aligned box spanning x0..x1 (east), z0..z1 (north), y0..y1 (depth)."""
    v = [
        (x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
        (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1),
    ]
    f = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    return mesh(v, f, material, name="box")


def prism(
    outline: list[tuple[float, float]],
    material: bpy.types.Material,
    y0: float = -0.25,
    y1: float = 0.25,
    bulge: float = 0.0,
) -> bpy.types.Object:
    """Extrudes a picture-plane outline (x, z points, counter-clockwise) along
    depth. `bulge` pushes the front face's centre towards the viewer so flat
    shapes catch light like a rounded surface."""
    n = len(outline)
    cx = sum(p[0] for p in outline) / n
    cz = sum(p[1] for p in outline) / n
    verts = [(x, y0, z) for x, z in outline] + [(x, y1, z) for x, z in outline]
    verts.append((cx, y0 - bulge, cz))
    centre = len(verts) - 1
    faces: list[tuple[int, ...]] = []
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, centre))  # front fan
        faces.append((i, n + i, n + j, j))  # sides
    faces.append(tuple(range(2 * n - 1, n - 1, -1)))  # back
    return mesh(verts, faces, material, smooth=bulge > 0, name="prism")


def sphere(
    x: float,
    z: float,
    r: float,
    material: bpy.types.Material,
    y: float = 0.0,
    squash: tuple[float, float, float] = (1, 1, 1),
    segments: int = 12,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments, ring_count=max(6, segments // 2), radius=r, location=(x, y, z)
    )
    obj = bpy.context.active_object
    obj.scale = squash
    obj.data.materials.append(material)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj


def cylinder(
    x: float,
    z0: float,
    z1: float,
    r: float,
    material: bpy.types.Material,
    y: float = 0.0,
    segments: int = 10,
    r_top: float | None = None,
) -> bpy.types.Object:
    """Upright cylinder or cone (r_top) from z0 to z1."""
    bpy.ops.mesh.primitive_cone_add(
        vertices=segments,
        radius1=r,
        radius2=r if r_top is None else r_top,
        depth=z1 - z0,
        location=(x, y, (z0 + z1) / 2),
    )
    obj = bpy.context.active_object
    obj.data.materials.append(material)
    return obj


def heightfield(
    x0: float,
    z0: float,
    x1: float,
    z1: float,
    height,
    material: bpy.types.Material,
    steps: int = 32,
    y: float = 0.0,
) -> bpy.types.Object:
    """Surface in the picture plane whose depth is `height(x, z)` towards the
    viewer, for water ripples, rock faces and sand. Positive is nearer."""
    verts = []
    for j in range(steps + 1):
        for i in range(steps + 1):
            x = x0 + (x1 - x0) * i / steps
            z = z0 + (z1 - z0) * j / steps
            verts.append((x, y - height(x, z), z))
    faces = []
    row = steps + 1
    for j in range(steps):
        for i in range(steps):
            a = j * row + i
            faces.append((a, a + 1, a + row + 1, a + row))
    return mesh(verts, faces, material, smooth=True, name="field")


def periodic(x: float, k: int = 1, phase: float = 0.0) -> float:
    """sin with a period of 1/k units, safe across open tile edges."""
    return math.sin(2 * math.pi * (k * x + phase))


# ---------------------------------------------------------------------------
# Pixels
# ---------------------------------------------------------------------------


def _palette_array(palette: list[str]) -> np.ndarray:
    return np.array([rgb(BASE.get(c, c)) for c in palette], dtype=np.float32)


def downsample(rgba: np.ndarray, factor: int, palette: list[str] | None) -> np.ndarray:
    """Reduces a supersampled render to tile pixels: alpha is cut at 50 %
    coverage, and each pixel takes the palette colour most of its opaque
    subpixels snap to, which keeps flat areas clean instead of speckled.
    Input and output are straight-alpha sRGB floats, rows top to bottom."""
    h, w = rgba.shape[0] // factor, rgba.shape[1] // factor
    blocks = rgba.reshape(h, factor, w, factor, 4).transpose(0, 2, 1, 3, 4)
    blocks = blocks.reshape(h, w, factor * factor, 4)
    alpha = blocks[..., 3].mean(axis=-1)
    out = np.zeros((h, w, 4), dtype=np.float32)
    out[..., 3] = (alpha >= 0.5).astype(np.float32)
    pal = (
        _palette_array(palette)
        if palette
        else np.array(
            [(r / 7, g / 7, b / 7) for r in range(8) for g in range(8) for b in range(8)],
            dtype=np.float32,
        )
    )
    # Weighted distance: the eye is most sensitive to green.
    weights = np.array([0.3, 0.59, 0.11], dtype=np.float32)
    diff = blocks[..., None, :3] - pal[None, None, None, :, :]
    index = ((diff**2) * weights).sum(axis=-1).argmin(axis=-1)
    opaque = blocks[..., 3] >= 0.5
    votes = np.zeros((h, w, len(pal)), dtype=np.int32)
    rows, cols = np.indices((h, w))
    for k in range(factor * factor):
        np.add.at(votes, (rows, cols, index[..., k]), opaque[..., k].astype(np.int32))
    out[..., :3] = pal[votes.argmax(axis=-1)]
    out[out[..., 3] == 0] = 0
    return out


def read_png(path: str) -> np.ndarray:
    image = bpy.data.images.load(path, check_existing=False)
    w, h = image.size
    pixels = np.empty(w * h * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    bpy.data.images.remove(image)
    return pixels.reshape(h, w, 4)[::-1].copy()


def write_png(path: str, rgba: np.ndarray):
    h, w = rgba.shape[:2]
    image = bpy.data.images.new("tk-out", w, h, alpha=True)
    image.colorspace_settings.name = "sRGB"
    image.pixels.foreach_set(np.ascontiguousarray(rgba[::-1]).ravel())
    image.filepath_raw = path
    image.file_format = "PNG"
    image.save()
    bpy.data.images.remove(image)
