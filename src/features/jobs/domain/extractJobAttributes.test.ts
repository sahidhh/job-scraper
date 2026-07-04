import { describe, expect, it } from "vitest";
import { extractJobAttributes } from "./extractJobAttributes";

describe("extractJobAttributes", () => {
  describe("employmentType", () => {
    it("detects internship", () => {
      expect(extractJobAttributes("Summer Internship Program").employmentType).toBe("internship");
    });

    it("prioritizes internship over full-time when both are mentioned", () => {
      expect(extractJobAttributes("Full-time internship for students").employmentType).toBe("internship");
    });

    it("detects contract", () => {
      expect(extractJobAttributes("6-month contract position").employmentType).toBe("contract");
    });

    it("detects freelance", () => {
      expect(extractJobAttributes("Looking for a freelancer").employmentType).toBe("freelance");
    });

    it("detects temporary", () => {
      expect(extractJobAttributes("Temporary seasonal role").employmentType).toBe("temporary");
    });

    it("detects part-time", () => {
      expect(extractJobAttributes("Part-time position, 20 hrs/week").employmentType).toBe("part_time");
    });

    it("detects full-time", () => {
      expect(extractJobAttributes("This is a full-time role").employmentType).toBe("full_time");
    });

    it("returns null when no employment type text is present", () => {
      expect(extractJobAttributes("We build great software").employmentType).toBeNull();
    });
  });

  describe("seniority", () => {
    it("detects executive from title keywords", () => {
      expect(extractJobAttributes("Director of Engineering").seniority).toBe("executive");
    });

    it("detects principal from staff engineer phrasing", () => {
      expect(extractJobAttributes("Staff Engineer, Platform").seniority).toBe("principal");
    });

    it("detects lead from tech lead phrasing", () => {
      expect(extractJobAttributes("Tech Lead - Backend").seniority).toBe("lead");
    });

    it("does not misfire on bare 'lead' (e.g. lead generation)", () => {
      expect(extractJobAttributes("Sales role focused on lead generation").seniority).toBeNull();
    });

    it("detects senior", () => {
      expect(extractJobAttributes("Senior Backend Engineer").seniority).toBe("senior");
    });

    it("detects entry from junior/fresher phrasing", () => {
      expect(extractJobAttributes("Junior Developer, fresher welcome").seniority).toBe("entry");
    });

    it("detects mid from intermediate phrasing", () => {
      expect(extractJobAttributes("Mid-level Software Engineer").seniority).toBe("mid");
    });

    it("returns null when no seniority signal is present", () => {
      expect(extractJobAttributes("Software Engineer").seniority).toBeNull();
    });
  });

  describe("workArrangement", () => {
    it("detects hybrid", () => {
      expect(extractJobAttributes("Hybrid role, 3 days in office").workArrangement).toBe("hybrid");
    });

    it("detects onsite", () => {
      expect(extractJobAttributes("This is an on-site position").workArrangement).toBe("onsite");
    });

    it("returns null when neither is mentioned (e.g. fully remote postings)", () => {
      expect(extractJobAttributes("Work from anywhere").workArrangement).toBeNull();
    });
  });

  describe("visaSponsorship", () => {
    it("detects explicit sponsorship offered", () => {
      expect(extractJobAttributes("We offer visa sponsorship for this role").visaSponsorship).toBe(true);
    });

    it("detects explicit sponsorship not offered", () => {
      expect(extractJobAttributes("No visa sponsorship available for this position").visaSponsorship).toBe(false);
    });

    it("returns null when visa is not mentioned", () => {
      expect(extractJobAttributes("Great opportunity for a backend engineer").visaSponsorship).toBeNull();
    });
  });

  describe("relocationAssistance", () => {
    it("detects relocation assistance offered", () => {
      expect(extractJobAttributes("Relocation assistance provided").relocationAssistance).toBe(true);
    });

    it("detects relocation explicitly not offered", () => {
      expect(extractJobAttributes("No relocation assistance for this role").relocationAssistance).toBe(false);
    });

    it("returns null when relocation is not mentioned", () => {
      expect(extractJobAttributes("Join our growing team").relocationAssistance).toBeNull();
    });
  });

  describe("securityClearance", () => {
    it("detects a clearance requirement", () => {
      expect(extractJobAttributes("Active TS/SCI clearance required").securityClearance).toBe(true);
    });

    it("defaults to false when clearance is not mentioned", () => {
      expect(extractJobAttributes("Standard backend role").securityClearance).toBe(false);
    });
  });

  describe("urgentHiring", () => {
    it("detects urgent hiring language", () => {
      expect(extractJobAttributes("Urgently hiring, immediate joiners preferred").urgentHiring).toBe(true);
    });

    it("defaults to false when no urgency language is present", () => {
      expect(extractJobAttributes("We're looking for a great engineer").urgentHiring).toBe(false);
    });
  });

  it("extracts multiple independent signals from one posting", () => {
    const text =
      "Senior Backend Engineer (Contract) - Hybrid. Visa sponsorship not available. Urgently hiring.";
    const attrs = extractJobAttributes(text);
    expect(attrs.employmentType).toBe("contract");
    expect(attrs.seniority).toBe("senior");
    expect(attrs.workArrangement).toBe("hybrid");
    expect(attrs.visaSponsorship).toBe(false);
    expect(attrs.urgentHiring).toBe(true);
  });
});
