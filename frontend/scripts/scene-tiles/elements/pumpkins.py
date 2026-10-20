"""Orange ribbed pumpkins among curling vines on dark, cultivated earth."""

import math

import tilekit as kit
from fieldkit import rim

PALETTE = kit.ramp("#543c2c", "foliage", "#ed8529", "#b95620", "#ffb74f")


def _pumpkin(x, z, r):
    kit.sphere(x, z - r * .6, r, kit.mat("#543c2c"), y=-.15,
               squash=(1.12, .25, .42), segments=12)
    kit.sphere(x, z, r, kit.mat("#b95620"), y=-.24,
               squash=(1.1, .4, .87), segments=12)
    for dx, width, color in ((-.42, .42, "#ed8529"), (.12, .35, "#ffb74f"),
                              (.54, .27, "#ed8529")):
        kit.sphere(x + dx * r, z, r, kit.mat(color), y=-.31,
                   squash=(width, .12, .77), segments=12)
    kit.box(x - .025, z + r * .65, x + .035, z + r + .055,
            kit.mat("foliage"), -.47, -.42)


def build(tile):
    kit.box(-.4, -.4, 1.4, 1.4, kit.mat("#543c2c"), .10, .18)
    # Periodic vines meet every open edge, independent of the shape.
    for row in (.18, .67):
        points = [(i / 16, row + .06 * math.sin(math.tau * i / 16)) for i in range(-4, 21)]
        kit.prism(points + [(x, z + .045) for x, z in reversed(points)],
                  kit.mat("foliage"), -.08, -.04)
    layouts = {
        "single": ((.48, .48, .24), (.78, .20, .105)),
        "row": ((.22, .42, .16), (.67, .44, .205), (.84, .77, .09)),
        "square": ((.25, .25, .15), (.70, .27, .18), (.28, .74, .17), (.76, .74, .12)),
        "mass": ((.22, .24, .17), (.68, .24, .13), (.42, .67, .22), (.83, .78, .12)),
    }
    for i, (x, z) in enumerate(((.09, .20), (.46, .17), (.87, .63), (.16, .69), (.56, .79))):
        kit.prism([(x - .09, z), (x - .055, z + .10), (x + .035, z + .12),
                   (x + .10, z + .04), (x + .02, z - .035)],
                  kit.mat("foliageLight" if i % 2 else "foliage"), -.14, -.1, bulge=.025)
    for x, z, radius in layouts.get(tile.shape, layouts["mass"]):
        _pumpkin(x, z, radius)
    rim(tile, kit.mat(kit.shade("#543c2c", .72)), -.6, -.55)
