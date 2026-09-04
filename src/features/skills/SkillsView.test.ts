import { describe, expect, it } from "vitest";
import { availableSkillCount } from "./SkillsView";

describe("availableSkillCount", () => {
  it("统计已管理 Skill 的更新", () => {
    expect(availableSkillCount([
      { name: "new-skill", description: null, store_path: "/tmp/new", source: "Codex", has_content_conflict: false, is_update: false, modified_at: 0 },
      { name: "updated-skill", description: null, store_path: "/tmp/updated", source: "Codex", has_content_conflict: false, is_update: true, modified_at: 0 },
    ])).toBe(2);
  });

  it("统计可导入的新 Skill", () => {
    expect(availableSkillCount([
      { name: "new-skill", description: null, store_path: "/tmp/new", source: "Agent", has_content_conflict: false, is_update: false, modified_at: 0 },
    ])).toBe(1);
  });
});
