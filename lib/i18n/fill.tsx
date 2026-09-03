import React from "react";

/**
 * One translated sentence, with each {placeholder} swapped for a node.
 *
 * `translate` leaves a placeholder it was given no value for exactly as it is,
 * so calling `t(key)` with no vars hands the template through intact and the
 * nodes drop into wherever the language actually puts them. That is the whole
 * point: French moves the values around inside the sentence, so a
 * prefix/suffix split would have to be re-derived for every language.
 *
 *   fill(t("auto.ruleMove"), { column: <Chip>Due</Chip>, group: <Chip>Done</Chip> })
 *
 * A placeholder with no matching node is left on screen rather than dropped -
 * a visible `{group}` is a bug report; a silent gap is not.
 */
export function fill(
  text: string,
  nodes: Record<string, React.ReactNode>,
): React.ReactNode[] {
  return text.split(/(\{\w+\})/g).map((part, i) => {
    const name = /^\{(\w+)\}$/.exec(part)?.[1];
    return name && name in nodes ? (
      <React.Fragment key={i}>{nodes[name]}</React.Fragment>
    ) : (
      part
    );
  });
}
