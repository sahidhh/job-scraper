// A skill the resume lacks but matched jobs ask for (P1, level-up list).
export interface SkillGap {
  skill: string;
  demandCount: number; // number of matched jobs mentioning this skill
}

// A skill's demand across matched jobs (P1, in-demand view).
export interface SkillDemand {
  skill: string;
  count: number; // number of matched jobs mentioning this skill
}
