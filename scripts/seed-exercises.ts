import { Collection } from "@callumalpass/mdbase";

const exercises = [
  { name: "Bench Press", muscle_groups: ["chest", "triceps", "shoulders"], equipment: "barbell", tracking: "weight_reps" },
  { name: "Squat", muscle_groups: ["quads", "glutes", "hamstrings"], equipment: "barbell", tracking: "weight_reps" },
  { name: "Deadlift", muscle_groups: ["back", "hamstrings", "glutes"], equipment: "barbell", tracking: "weight_reps" },
  { name: "Overhead Press", muscle_groups: ["shoulders", "triceps"], equipment: "barbell", tracking: "weight_reps" },
  { name: "Barbell Row", muscle_groups: ["back", "biceps"], equipment: "barbell", tracking: "weight_reps" },
  { name: "Pull-Up", muscle_groups: ["back", "biceps"], equipment: "bodyweight", tracking: "reps_only" },
  { name: "Push-Up", muscle_groups: ["chest", "triceps", "shoulders"], equipment: "bodyweight", tracking: "reps_only" },
  { name: "Dip", muscle_groups: ["chest", "triceps", "shoulders"], equipment: "bodyweight", tracking: "reps_only" },
  { name: "Incline Dumbbell Press", muscle_groups: ["chest", "triceps", "shoulders"], equipment: "dumbbell", tracking: "weight_reps" },
  { name: "Dumbbell Curl", muscle_groups: ["biceps"], equipment: "dumbbell", tracking: "weight_reps" },
  { name: "Tricep Pushdown", muscle_groups: ["triceps"], equipment: "cable", tracking: "weight_reps" },
  { name: "Lateral Raise", muscle_groups: ["shoulders"], equipment: "dumbbell", tracking: "weight_reps" },
  { name: "Leg Press", muscle_groups: ["quads", "glutes"], equipment: "machine", tracking: "weight_reps" },
  { name: "Romanian Deadlift", muscle_groups: ["hamstrings", "glutes", "back"], equipment: "barbell", tracking: "weight_reps" },
  { name: "Lat Pulldown", muscle_groups: ["back", "biceps"], equipment: "cable", tracking: "weight_reps" },
  { name: "Cable Row", muscle_groups: ["back", "biceps"], equipment: "cable", tracking: "weight_reps" },
  { name: "Plank", muscle_groups: ["core"], equipment: "bodyweight", tracking: "timed" },
  { name: "Running", muscle_groups: ["cardio", "legs"], equipment: "none", tracking: "distance" },
  { name: "Cycling", muscle_groups: ["cardio", "legs"], equipment: "machine", tracking: "distance" },
  { name: "Kettlebell Swing", muscle_groups: ["glutes", "hamstrings", "core"], equipment: "kettlebell", tracking: "weight_reps" },
];

function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

async function main() {
  const opened = await Collection.open("./data");
  if (opened.error) {
    console.error("Failed to open collection:", opened.error.message);
    process.exit(1);
  }
  const collection = opened.collection!;

  try {
    let created = 0;
    let skipped = 0;

    for (const ex of exercises) {
      const slug = slugify(ex.name);
      const path = `exercises/${slug}.md`;

      const existing = await collection.read(path);
      if (!existing.error) {
        console.log(`  skip: ${path} (already exists)`);
        skipped++;
        continue;
      }

      const result = await collection.create({
        path,
        type: "exercise",
        frontmatter: ex,
      });

      if (result.error) {
        console.error(`  fail: ${path} — ${result.error.message}`);
      } else {
        console.log(`  created: ${path}`);
        created++;
      }
    }

    console.log(`\nDone: ${created} created, ${skipped} skipped`);
  } finally {
    await collection.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
