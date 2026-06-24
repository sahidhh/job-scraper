import type { SkillDictionaryEntry } from "@/shared/domain/skills";

// Curated canonical skill names + aliases, used for resume skill extraction
// and job keyword scoring (scoring.md §1-2). Order determines the order of
// `extractSkills()` results.
export const SKILLS_DICTIONARY: readonly SkillDictionaryEntry[] = [
  // Languages
  { canonical: "JavaScript", aliases: ["javascript", "js"] },
  { canonical: "TypeScript", aliases: ["typescript", "ts"] },
  { canonical: "Python", aliases: ["python"] },
  { canonical: "Java", aliases: ["java"] },
  { canonical: "C#", aliases: ["c#", "csharp"] },
  { canonical: "C++", aliases: ["c++", "cpp"] },
  { canonical: "C", aliases: ["c"] },
  { canonical: "Go", aliases: ["go", "golang"] },
  { canonical: "Rust", aliases: ["rust"] },
  { canonical: "Ruby", aliases: ["ruby"] },
  { canonical: "PHP", aliases: ["php"] },
  { canonical: "Swift", aliases: ["swift"] },
  { canonical: "Kotlin", aliases: ["kotlin"] },
  { canonical: "Scala", aliases: ["scala"] },
  { canonical: "SQL", aliases: ["sql"] },

  // Frontend
  { canonical: "React", aliases: ["react", "react.js", "reactjs"] },
  { canonical: "Next.js", aliases: ["next.js", "nextjs"] },
  { canonical: "Vue", aliases: ["vue", "vue.js", "vuejs"] },
  { canonical: "Angular", aliases: ["angular", "angularjs"] },
  { canonical: "Svelte", aliases: ["svelte"] },
  { canonical: "HTML", aliases: ["html", "html5"] },
  { canonical: "CSS", aliases: ["css", "css3"] },
  { canonical: "Tailwind CSS", aliases: ["tailwind", "tailwindcss", "tailwind css"] },
  { canonical: "Redux", aliases: ["redux"] },

  // Backend / runtimes / frameworks
  { canonical: "Node.js", aliases: ["node", "node.js", "nodejs"] },
  { canonical: "Express", aliases: ["express", "express.js", "expressjs"] },
  { canonical: "NestJS", aliases: ["nestjs", "nest.js"] },
  { canonical: ".NET", aliases: [".net", "dotnet", "asp.net"] },
  { canonical: "Django", aliases: ["django"] },
  { canonical: "Flask", aliases: ["flask"] },
  { canonical: "FastAPI", aliases: ["fastapi"] },
  { canonical: "Spring", aliases: ["spring", "spring boot"] },
  { canonical: "Ruby on Rails", aliases: ["rails", "ruby on rails"] },
  { canonical: "Laravel", aliases: ["laravel"] },
  { canonical: "GraphQL", aliases: ["graphql"] },
  { canonical: "REST", aliases: ["rest", "restful", "rest api"] },
  { canonical: "gRPC", aliases: ["grpc"] },

  // Databases / data
  { canonical: "PostgreSQL", aliases: ["postgresql", "postgres"] },
  { canonical: "MySQL", aliases: ["mysql"] },
  { canonical: "SQLite", aliases: ["sqlite"] },
  { canonical: "MongoDB", aliases: ["mongodb", "mongo"] },
  { canonical: "Redis", aliases: ["redis"] },
  { canonical: "Elasticsearch", aliases: ["elasticsearch"] },
  { canonical: "Supabase", aliases: ["supabase"] },
  { canonical: "Firebase", aliases: ["firebase"] },

  // Cloud / infra / devops
  { canonical: "AWS", aliases: ["aws", "amazon web services"] },
  { canonical: "Azure", aliases: ["azure"] },
  { canonical: "GCP", aliases: ["gcp", "google cloud"] },
  { canonical: "Docker", aliases: ["docker"] },
  { canonical: "Kubernetes", aliases: ["kubernetes", "k8s"] },
  { canonical: "Terraform", aliases: ["terraform"] },
  { canonical: "CI/CD", aliases: ["ci/cd", "ci cd", "continuous integration", "continuous deployment"] },
  { canonical: "Linux", aliases: ["linux"] },
  { canonical: "Git", aliases: ["git"] },
  { canonical: "Nginx", aliases: ["nginx"] },

  // Message queues / event streaming
  { canonical: "Kafka", aliases: ["kafka", "apache kafka"] },
  { canonical: "RabbitMQ", aliases: ["rabbitmq", "rabbit mq"] },
  { canonical: "Celery", aliases: ["celery"] },

  // Data engineering
  { canonical: "Spark", aliases: ["spark", "apache spark", "pyspark"] },
  { canonical: "Airflow", aliases: ["airflow", "apache airflow"] },
  { canonical: "dbt", aliases: ["dbt", "data build tool"] },
  { canonical: "Snowflake", aliases: ["snowflake"] },

  // Observability / IaC
  { canonical: "Prometheus", aliases: ["prometheus"] },
  { canonical: "Grafana", aliases: ["grafana"] },
  { canonical: "Ansible", aliases: ["ansible"] },

  // Modern frontend
  { canonical: "SvelteKit", aliases: ["sveltekit", "svelte kit"] },
  { canonical: "Remix", aliases: ["remix", "remix.run"] },
  { canonical: "tRPC", aliases: ["trpc", "t3"] },

  // Testing
  { canonical: "Jest", aliases: ["jest"] },
  { canonical: "Vitest", aliases: ["vitest"] },
  { canonical: "Cypress", aliases: ["cypress"] },
  { canonical: "Playwright", aliases: ["playwright"] },

  // Mobile
  { canonical: "React Native", aliases: ["react native"] },
  { canonical: "Flutter", aliases: ["flutter"] },

  // Data science / AI
  { canonical: "Machine Learning", aliases: ["machine learning", "ml"] },
  { canonical: "TensorFlow", aliases: ["tensorflow"] },
  { canonical: "PyTorch", aliases: ["pytorch"] },
  { canonical: "Pandas", aliases: ["pandas"] },
] as const;
