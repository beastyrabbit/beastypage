"""Cabbages, carrot tops and lettuce in small beds with wooden outer edges."""

import tilekit as kit
from fieldkit import field_bounds, rim

PALETTE = kit.ramp("#63492f", "foliage", "#96bb61", "wood", "#e89a43")


def _cabbage(x, z, r):
    kit.sphere(x, z, r, kit.mat("foliage"), y=-.18,
               squash=(1, .35, .85), segments=12)
    kit.sphere(x - r * .17, z + r * .18, r * .65, kit.mat("#96bb61"),
               y=-.25, squash=(1, .25, .8), segments=10)
    kit.box(x, z - r * .35, x + .035, z + r * .5,
            kit.mat("foliage"), -.31, -.28)


def _carrot(x, z):
    kit.prism([(x - .035, z), (x + .035, z), (x, z - .09)],
              kit.mat("#e89a43"), -.17, -.13)
    kit.prism([(x - .025, z - .01), (x - .105, z + .11),
               (x - .055, z + .15), (x, z + .07),
               (x + .025, z + .18), (x + .065, z + .16),
               (x + .055, z + .06), (x + .11, z + .12),
               (x + .13, z + .07), (x + .025, z - .01)],
              kit.mat("foliageLight"), -.24, -.19)


def _lettuce(x, z):
    kit.prism([(x - .09, z - .05), (x + .08, z - .05),
               (x + .115, z + .06), (x + .04, z + .09),
               (x, z + .14), (x - .035, z + .08),
               (x - .105, z + .11)], kit.mat("#96bb61"), -.24, -.18, bulge=.025)
    kit.box(x - .025, z - .04, x + .015, z + .07,
            kit.mat("foliage"), -.3, -.27)


def _plant(tile):
    # The single is a mixed kitchen bed; larger shapes have planted rows.
    if tile.shape == "single":
        _cabbage(.26, .70, .17)
        _cabbage(.70, .70, .14)
        _carrot(.25, .23)
        _carrot(.47, .23)
        _lettuce(.75, .27)
    elif tile.shape == "row":
        for x in (.18, .5, .82):
            _cabbage(x, .68, .14)
            _carrot(x, .23)
        _lettuce(.35, .43)
        _lettuce(.72, .43)
    else:
        xs = (.19, .5, .81) if tile.shape == "square" else (.15, .40, .65, .90)
        for x in xs:
            _cabbage(x, .79, .115 if tile.shape == "mass" else .13)
            _carrot(x, .44)
            _lettuce(x, .15)


def build(tile):
    kit.box(-.4, -.4, 1.4, 1.4, kit.mat("#63492f"), .12, .18)
    _plant(tile)
    # Only the outside perimeter has a timber frame.
    left, right, bottom, top = field_bounds(tile)
    rim(tile, kit.mat("wood"), -.4, -.34)
    if not tile.n:
        kit.box(left, .9375, right, .97, kit.mat("woodLight"), -.43, -.4)
    if not tile.w:
        kit.box(0, bottom, .03, top, kit.mat("woodLight"), -.43, -.4)
