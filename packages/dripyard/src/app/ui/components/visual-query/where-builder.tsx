import type { CSSProperties } from "react";
import { QueryBuilder, type FullField, type RuleGroupType } from "react-querybuilder";
import "react-querybuilder/dist/query-builder.css";

export interface WhereBuilderProps {
  fields: Array<{ name: string; label: string; type?: string }>;
  value: RuleGroupType;
  onChange: (rules: RuleGroupType) => void;
}

/**
 * WHERE clause builder backed by react-querybuilder. Field names are
 * expected to be alias-qualified by the caller (e.g. `m.price_1m_prompt`)
 * so the generated SQL references resolve without extra mapping.
 */
export function WhereBuilder({ fields, value, onChange }: WhereBuilderProps) {
  // react-querybuilder's FullField requires both `name` and `value`; map
  // the simpler prop shape onto it, deriving the input type from the
  // column type so numeric/boolean editors render correctly.
  const qbFields: FullField[] = fields.map((f) => ({
    name: f.name,
    value: f.name,
    label: f.label,
    inputType:
      f.type === "number"
        ? "number"
        : f.type === "boolean"
          ? "checkbox"
          : "text",
  }));

  return (
    <div
      className="bg-[var(--panel)] border border-[var(--border-muted)] rounded p-3 overflow-auto"
      style={{ maxHeight: 220 }}
    >
      <style>{RQB_DARK_STYLE}</style>
      <div
        className="rqb-dark"
        style={
          {
            "--rqb-base-color": "var(--accent)",
            "--rqb-background-color": "color-mix(in srgb, transparent, var(--accent) 18%)",
            "--rqb-border-color": "var(--border-muted)",
          } as CSSProperties
        }
      >
        <QueryBuilder
          fields={qbFields}
          query={value}
          onQueryChange={onChange}
        />
      </div>
    </div>
  );
}

/**
 * Scoped dark-theme overrides for the default react-querybuilder chrome.
 * The shipped CSS only handles layout + a light color story via CSS
 * variables; form controls are left to the browser default, which is
 * unreadable on the dark panel. These rules pin them to the water theme.
 */
const RQB_DARK_STYLE = `
.rqb-dark .ruleGroup,
.rqb-dark .rule {
  border-color: var(--border-muted);
  border-style: solid;
}
.rqb-dark .ruleGroup {
  background: var(--panel-raised);
}
.rqb-dark select,
.rqb-dark input[type="text"],
.rqb-dark input:not([type]) {
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--border-muted);
  border-radius: 0.25rem;
  padding: 2px 6px;
  font-size: 12px;
  outline: none;
}
.rqb-dark select:focus,
.rqb-dark input:focus {
  border-color: var(--accent);
}
.rqb-dark button {
  color: var(--muted);
  border-color: var(--border-muted);
  background: transparent;
  font-size: 12px;
}
.rqb-dark button:hover {
  color: var(--text);
  border-color: var(--border-strong);
}
.rqb-dark .ruleGroup-addRule,
.rqb-dark .ruleGroup-addGroup {
  color: var(--accent);
}
.rqb-dark .rule-remove {
  color: var(--error);
}
`;
