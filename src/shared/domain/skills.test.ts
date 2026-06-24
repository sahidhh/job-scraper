import { describe, expect, it } from "vitest";
import { SKILLS_DICTIONARY } from "@/shared/config/skills-dictionary";
import { extractSkills } from "./skills";

// Minimal inline dictionary for token-boundary tests, independent of the
// main dictionary so that SK-2 tests don't break if canonical names change.
const CLIKE_DICT = [
  { canonical: "C++", aliases: ["c++", "cpp"] },
  { canonical: "C#", aliases: ["c#", "csharp"] },
  { canonical: "C", aliases: ["c"] },
] as const;

describe("extractSkills — token boundary (SK-2)", () => {
  it("does not extract C when only C++ is mentioned", () => {
    const skills = extractSkills("C++ developer needed", CLIKE_DICT);
    expect(skills).toContain("C++");
    expect(skills).not.toContain("C");
  });

  it("does not extract C when only C# is mentioned", () => {
    const skills = extractSkills("C# backend engineer", CLIKE_DICT);
    expect(skills).toContain("C#");
    expect(skills).not.toContain("C");
  });

  it("does not extract C when csharp alias is used", () => {
    const skills = extractSkills("csharp developer", CLIKE_DICT);
    expect(skills).toContain("C#");
    expect(skills).not.toContain("C");
  });

  it("does not extract C when cpp alias is used", () => {
    const skills = extractSkills("cpp systems engineer", CLIKE_DICT);
    expect(skills).toContain("C++");
    expect(skills).not.toContain("C");
  });

  it("extracts standalone C correctly", () => {
    const skills = extractSkills("proficient in C and Python", CLIKE_DICT);
    expect(skills).toContain("C");
  });

  it("extracts C++ correctly from a C++ posting", () => {
    const skills = extractSkills("experience with C++ is required", CLIKE_DICT);
    expect(skills).toContain("C++");
  });

  it("extracts C# correctly from a C# posting", () => {
    const skills = extractSkills("build APIs in C#", CLIKE_DICT);
    expect(skills).toContain("C#");
  });

  it("extracts both C++ and C when both are explicitly mentioned", () => {
    const skills = extractSkills("C++ and C systems programmer", CLIKE_DICT);
    expect(skills).toContain("C++");
    expect(skills).toContain("C");
  });
});

describe("extractSkills — full dictionary integration", () => {
  it("extracts React from a job description", () => {
    const skills = extractSkills("Build UI components using React and TypeScript", SKILLS_DICTIONARY);
    expect(skills).toContain("React");
    expect(skills).toContain("TypeScript");
  });

  it("does not match partial words (react inside reactive)", () => {
    const skills = extractSkills("must be reactive and proactive", SKILLS_DICTIONARY);
    expect(skills).not.toContain("React");
  });

  it("matches Node.js aliases (node, nodejs)", () => {
    const skills = extractSkills("backend in node and express", SKILLS_DICTIONARY);
    expect(skills).toContain("Node.js");
  });

  it("returns empty array when no skills mentioned", () => {
    const skills = extractSkills("we offer great health benefits and a fun team", SKILLS_DICTIONARY);
    expect(skills).toEqual([]);
  });
});

describe("extractSkills — new skills (SK-5)", () => {
  it("extracts Kafka", () => {
    const skills = extractSkills("experience with Kafka message streaming required", SKILLS_DICTIONARY);
    expect(skills).toContain("Kafka");
  });

  it("extracts RabbitMQ", () => {
    const skills = extractSkills("message queuing with RabbitMQ", SKILLS_DICTIONARY);
    expect(skills).toContain("RabbitMQ");
  });

  it("extracts Ansible", () => {
    const skills = extractSkills("infrastructure automation using Ansible playbooks", SKILLS_DICTIONARY);
    expect(skills).toContain("Ansible");
  });

  it("extracts Prometheus", () => {
    const skills = extractSkills("monitoring stack includes Prometheus and alerting", SKILLS_DICTIONARY);
    expect(skills).toContain("Prometheus");
  });

  it("extracts Grafana", () => {
    const skills = extractSkills("dashboards built in Grafana", SKILLS_DICTIONARY);
    expect(skills).toContain("Grafana");
  });

  it("extracts Snowflake", () => {
    const skills = extractSkills("data warehouse on Snowflake", SKILLS_DICTIONARY);
    expect(skills).toContain("Snowflake");
  });

  it("extracts dbt", () => {
    const skills = extractSkills("transform data using dbt models", SKILLS_DICTIONARY);
    expect(skills).toContain("dbt");
  });

  it("extracts Spark", () => {
    const skills = extractSkills("distributed processing with Apache Spark", SKILLS_DICTIONARY);
    expect(skills).toContain("Spark");
  });

  it("extracts Airflow", () => {
    const skills = extractSkills("pipeline orchestration with Airflow DAGs", SKILLS_DICTIONARY);
    expect(skills).toContain("Airflow");
  });

  it("extracts Celery", () => {
    const skills = extractSkills("async tasks handled by Celery workers", SKILLS_DICTIONARY);
    expect(skills).toContain("Celery");
  });

  it("extracts SvelteKit", () => {
    const skills = extractSkills("full-stack app built with SvelteKit", SKILLS_DICTIONARY);
    expect(skills).toContain("SvelteKit");
  });

  it("extracts tRPC", () => {
    const skills = extractSkills("type-safe APIs via tRPC", SKILLS_DICTIONARY);
    expect(skills).toContain("tRPC");
  });

  it("extracts Remix", () => {
    const skills = extractSkills("full-stack Remix application", SKILLS_DICTIONARY);
    expect(skills).toContain("Remix");
  });
});
