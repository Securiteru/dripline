import { strict as assert } from "node:assert";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { loadPluginFromPath } from "../plugin/loader.js";

describe("loadPluginFromPath", () => {
  it("loads external plugins that import dripline", async () => {
    const dir = join(tmpdir(), `dripline-plugin-${Date.now()}`);
    try {
      mkdirSync(dir, { recursive: true });
      const pluginPath = join(dir, "example.ts");
      writeFileSync(
        pluginPath,
        `import type { DriplinePluginAPI } from "dripline";
import { asyncGet } from "dripline";

export default function plugin(dl: DriplinePluginAPI) {
  void asyncGet;
  dl.setName("external");
  dl.registerTable("external_rows", {
    columns: [{ name: "id", type: "number" }],
    async *list() {
      yield { id: 1 };
    },
  });
}
`,
      );

      const plugin = await loadPluginFromPath(pluginPath);
      assert.equal(plugin.name, "external");
      assert.equal(plugin.tables[0].name, "external_rows");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("loads external plugins that import dripline public subpaths", async () => {
    const dir = join(tmpdir(), `dripline-plugin-${Date.now()}`);
    try {
      mkdirSync(dir, { recursive: true });
      const pluginPath = join(dir, "subpaths.ts");
      writeFileSync(
        pluginPath,
        `import type { DriplinePluginAPI } from "dripline";
import { syncGet } from "dripline/utils/http";
import { commandExists } from "dripline/utils/cli";

export default function plugin(dl: DriplinePluginAPI) {
  void syncGet;
  void commandExists;
  dl.setName("subpaths");
  dl.registerTable("subpath_rows", {
    columns: [{ name: "id", type: "number" }],
    async *list() {
      yield { id: 1 };
    },
  });
}
`,
      );

      const plugin = await loadPluginFromPath(pluginPath);
      assert.equal(plugin.name, "subpaths");
      assert.equal(plugin.tables[0].name, "subpath_rows");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
