import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createJiti } from "jiti";
import { findConfigDir } from "../config/loader.js";
import { resolvePluginExport } from "./api.js";
import { registry } from "./registry.js";
import type { PluginDef } from "./types.js";

const jiti = createJiti(import.meta.url, {
  moduleCache: false,
  interopDefault: true,
  tryNative: false,
  alias: {
    dripline: new URL("../index.js", import.meta.url).pathname,
    "dripline/utils/http": new URL("../utils/http.js", import.meta.url)
      .pathname,
    "dripline/utils/cli": new URL("../utils/cli.js", import.meta.url)
      .pathname,
  },
});

export async function loadPluginFromPath(path: string): Promise<PluginDef> {
  let absPath = resolve(path);

  // If it's a directory, find the entry point
  if (existsSync(absPath) && statSync(absPath).isDirectory()) {
    const candidates = [
      join(absPath, "src", "index.ts"),
      join(absPath, "src", "index.js"),
      join(absPath, "index.ts"),
      join(absPath, "index.js"),
    ];

    // Check package.json main field
    const pkgPath = join(absPath, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
        if (pkg.main) candidates.unshift(join(absPath, pkg.main));
      } catch {}
    }

    const found = candidates.find((c) => existsSync(c));
    if (found) {
      absPath = found;
    } else {
      throw new Error(`No entry point found in ${absPath}`);
    }
  }

  // Plugins are often stored outside the project/package tree (for
  // example in workspace directories). Load them through Dripline's
  // module context so documented imports like `from "dripline"` work
  // without requiring a node_modules folder next to the plugin file.
  const mod = await jiti.import(absPath);
  const pluginId = absPath.replace(/.*\//, "").replace(/\.(ts|js)$/, "");
  return resolvePluginExport((mod as any).default ?? mod, pluginId);
}

async function loadFromDirectory(dir: string): Promise<PluginDef[]> {
  const plugins: PluginDef[] = [];
  if (!existsSync(dir)) return plugins;

  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (
      stat.isFile() &&
      (entry.endsWith(".ts") || entry.endsWith(".js")) &&
      !entry.endsWith(".d.ts") &&
      !entry.endsWith(".test.ts")
    ) {
      try {
        plugins.push(await loadPluginFromPath(fullPath));
      } catch (e) { console.error(`[plugin] failed to load ${fullPath}:`, (e as Error).message); }
    } else if (stat.isDirectory()) {
      const indexTs = join(fullPath, "index.ts");
      const indexJs = join(fullPath, "index.js");
      if (existsSync(indexTs)) {
        try {
          plugins.push(await loadPluginFromPath(indexTs));
        } catch (e) { console.error(`[plugin] failed to load ${indexTs}:`, (e as Error).message); }
      } else if (existsSync(indexJs)) {
        try {
          plugins.push(await loadPluginFromPath(indexJs));
        } catch (e) { console.error(`[plugin] failed to load ${indexJs}:`, (e as Error).message); }
      }

      const pkgJson = join(fullPath, "package.json");
      if (existsSync(pkgJson)) {
        try {
          const pkg = JSON.parse(readFileSync(pkgJson, "utf-8"));
          const pluginPaths: string[] = pkg.dripline?.plugins ?? [];
          for (const p of pluginPaths) {
            try {
              plugins.push(await loadPluginFromPath(join(fullPath, p)));
            } catch (e) { console.error(`[plugin] failed to load ${join(fullPath, p)}:`, (e as Error).message); }
          }
        } catch {}
      }
    }
  }

  return plugins;
}

export async function loadPluginsFromConfig(configDir: string): Promise<void> {
  const pluginsFile = join(configDir, "plugins.json");
  if (!existsSync(pluginsFile)) return;

  try {
    const data = JSON.parse(readFileSync(pluginsFile, "utf-8"));
    const entries: Array<{ path: string }> = data.plugins ?? data;

    for (const entry of entries) {
      const p = typeof entry === "string" ? entry : entry.path;
      try {
        const plugin = await loadPluginFromPath(p);
        registry.register(plugin);
      } catch (e) { console.error(`[plugin] failed to load ${p}:`, (e as Error).message); }
    }
  } catch {}
}

export async function loadAllPlugins(): Promise<void> {
  const loaded = new Set<string>();

  function registerIfNew(plugin: PluginDef) {
    if (!loaded.has(plugin.name)) {
      registry.register(plugin);
      loaded.add(plugin.name);
    }
  }

  const configDir = findConfigDir();
  if (configDir) {
    const projectPluginsDir = join(configDir, "plugins");
    const projectPlugins = await loadFromDirectory(projectPluginsDir);
    for (const p of projectPlugins) registerIfNew(p);

    await loadPluginsFromConfig(configDir);
    for (const p of registry.listPlugins()) loaded.add(p.name);
  }

  const globalDir = join(homedir(), ".dripline", "plugins");
  const globalPlugins = await loadFromDirectory(globalDir);
  for (const p of globalPlugins) registerIfNew(p);
}
