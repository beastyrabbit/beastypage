export const CUSTOM_ACCESSORIES = [
  {
    id: "mouse",
    name: "COMPUTER MOUSE",
    note: "Carried by its cable; resting beside newborn and sick cats",
  },
  {
    id: "controller",
    name: "GAME CONTROLLER",
    note: "Carried by its cable with a pose-specific viewing angle",
  },
  {
    id: "screwdriver",
    name: "SCREWDRIVER",
    note: "Held by its handle; resting beside newborn and sick cats",
  },
] as const;

export const CUSTOM_ACCESSORY_POSE_GROUPS = [
  {
    id: "newborn",
    label: "Newborn",
    poses: ["newborn0", "newborn1", "newborn2"],
  },
  {
    id: "kitten",
    label: "Kitten",
    poses: ["kitten0", "kitten1", "kitten2"],
  },
  {
    id: "adolescent-short",
    label: "Adolescent · short",
    poses: ["adolescent_short0", "adolescent_short1", "adolescent_short2"],
  },
  {
    id: "adolescent-long",
    label: "Adolescent · long",
    poses: ["adolescent_long0", "adolescent_long1", "adolescent_long2"],
  },
  {
    id: "adult-short",
    label: "Adult · short",
    poses: ["adult_short0", "adult_short1", "adult_short2"],
  },
  {
    id: "adult-long",
    label: "Adult · long",
    poses: ["adult_long0", "adult_long1", "adult_long2"],
  },
  {
    id: "senior",
    label: "Senior",
    poses: ["senior0", "senior1", "senior2"],
  },
  {
    id: "para",
    label: "Paralyzed",
    poses: ["para_adult_short0", "para_adult_long0", "para_young0"],
  },
  {
    id: "sick",
    label: "Sick",
    poses: ["sick_adult0", "sick_young0"],
  },
] as const;

export const CUSTOM_ACCESSORY_POSES = CUSTOM_ACCESSORY_POSE_GROUPS.flatMap(
  (group) => group.poses,
);
