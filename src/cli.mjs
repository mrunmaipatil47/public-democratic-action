#!/usr/bin/env node
/**
 * Command-line entry for the synthetic case-workflow prototype.
 *
 *   node src/cli.mjs simulate <scenario>|all   walk a synthetic case through the process
 *   node src/cli.mjs list                      list the scenarios
 *   node src/cli.mjs issue <id>                print one issue card from data/issues.json
 *   node src/cli.mjs routes                    print the seven challenge routes (Appendix B)
 *   node src/cli.mjs org <number>              print one organisation (section 7)
 *
 * Plain text, no colours. Exit code 2 on bad usage.
 *
 * @module cli
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getIssue, getRoutes, loadDataFile, normaliseIssueId } from './workflow/data.mjs';
import { status } from './workflow/deadlines.mjs';
import { UnknownIssueError } from './workflow/errors.mjs';
import { toPublicSummary } from './workflow/public.mjs';
import { getScenario, scenarios } from './workflow/scenarios/index.mjs';

const USAGE = `Public Voice Between Elections: synthetic case-workflow prototype

Usage:
  node src/cli.mjs simulate <scenario>|all   walk a synthetic case through the process
  node src/cli.mjs list                      list the scenarios
  node src/cli.mjs issue <id>                print one issue card (001-100)
  node src/cli.mjs routes                    print the seven challenge routes
  node src/cli.mjs org <number>              print one organisation (1-13)
  node src/cli.mjs help                      show this text

Everything simulated here is synthetic. The engine records, reminds and escalates review;
it never invents a fine, removal, court order or mandatory hearing.
Scenarios: ${scenarios.map((s) => s.id).join(', ')}
`;

/**
 * Render rows as a plain-text table with a header.
 * @param {string[]} header
 * @param {string[][]} rows
 * @returns {string}
 */
export function renderTable(header, rows) {
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)));
  const last = header.length - 1;
  const line = (/** @type {string[]} */ cells) =>
    cells.map((c, i) => (i === last ? c : c.padEnd(widths[i]))).join(' | ').trimEnd();
  const rule = widths.map((w) => '-'.repeat(w)).join('-+-');
  return [line(header), rule, ...rows.map(line)].join('\n');
}

/**
 * @param {import('./workflow/simulate.mjs').Scenario} scenario
 * @returns {string}
 */
export function renderScenario(scenario) {
  const { kase, timeline } = scenario.run();
  const now = timeline[timeline.length - 1].at;
  const st = status(kase, { now });
  const pub = toPublicSummary(kase, { now });
  const out = [];
  out.push(`== ${scenario.title} [${scenario.id}]`);
  out.push(scenario.description);
  out.push('');
  // Pack §5 Retaliation: "do not expose the person on a dashboard." The CLI is a human-readable export too, so a
  // protected case's own free text is withheld here as well; the scenario's narration is the author's, not the record's.
  const shielded = kase.flags.protected;
  out.push(`Case ${kase.id} | issue ${kase.issueId} | ${kase.participationRoute} | channel ${kase.channel} | received ${kase.receivedAt}${shielded ? ' | PROTECTED' : ''}`);
  out.push(shielded ? 'Summary: withheld (protected case; do not expose the person on a dashboard)' : `Summary: ${kase.summary}`);
  out.push('');
  out.push(renderTable(['date', 'event', 'actor', 'note'], timeline.map((t) => [t.at, t.type, t.actorRole, t.note])));
  out.push('');
  out.push(`Status at ${now}: state=${st.state}`);
  if (st.overdue.length === 0) {
    out.push('  overdue: none');
  } else {
    for (const o of st.overdue) out.push(`  overdue: ${o.stage} (due ${o.dueAt}, ${o.daysOverdue} days)`);
  }
  out.push('  next actions:');
  if (st.nextActions.length === 0) out.push('    (none)');
  for (const a of st.nextActions) out.push(`    - ${a}`);
  out.push('');
  if (pub === null) {
    out.push('Public summary: null (protected case; do not expose the person on a dashboard)');
  } else {
    out.push(`Public summary: ${JSON.stringify(pub)}`);
  }
  return out.join('\n');
}

/** @returns {string} */
export function renderList() {
  return renderTable(['id', 'title', 'description'], scenarios.map((s) => [s.id, s.title, s.description]));
}

/**
 * @param {string} ref
 * @returns {string}
 */
export function renderIssue(ref) {
  const issue = getIssue(ref);
  const domains = /** @type {{ id: string, name: string, range: [string, string] }[]} */ (loadDataFile('domains'));
  const domain = domains.find((d) => d.id === issue.domainId);
  const routes = getRoutes();
  const routeNames = issue.challengeRoutes.map((code) => {
    const r = routes.items.find((x) => x.code === code);
    return r ? `${code} ${r.name}` : code;
  });
  return [
    `${issue.id}. ${issue.title}`,
    `Domain: ${domain ? `${domain.name} (${domain.range[0]}-${domain.range[1]})` : issue.domainId}`,
    `Raise: ${issue.raise.join(', ')}`,
    `Answer (indicative owner; owners require current state/sector validation): ${issue.answer.join('; ')}`,
    `Possible change: ${issue.possibleChange}`,
    `Evidence: ${issue.evidence.join(', ')}`,
    `Challenge routes: ${routeNames.join('; ')}`,
    '',
    'No evidence listed is asserted to have already been collected. Routes are options, not a compulsory ladder.',
  ].join('\n');
}

/** @returns {string} */
export function renderRoutes() {
  const routes = getRoutes();
  const rows = routes.items.map((r) => [r.code, r.name, r.description]);
  return `${renderTable(['code', 'route', 'meaning'], rows)}\n\n${routes.caveat}`;
}

/**
 * @param {string} ref
 * @returns {string}
 */
export function renderOrg(ref) {
  const data = /** @type {{ selectionBasis: string, items: any[] }} */ (loadDataFile('organisations'));
  // Plain decimal digits only: "0x4", "4e0", "+4" and "4.0" are not organisation numbers.
  const org = /^\d{1,2}$/.test(ref) ? data.items.find((o) => o.number === Number(ref)) : undefined;
  if (!org) throw new UsageError(`unknown organisation ${JSON.stringify(ref)}; use a number from 1 to ${data.items.length}.`);
  return [
    `${String(org.number).padStart(2, '0')}. ${org.name}`,
    `Documented relevance: ${org.documentedRelevance}`,
    `Agenda links: ${org.agendaLinksText} (issues ${org.agendaIssueIds.join(', ')})`,
    `Suggested remote contribution: ${org.suggestedRemoteContribution}`,
    `Status: ${org.status}`,
    `Official evidence: ${org.officialEvidenceUrl}`,
    `Public institutional route: ${org.publicRouteUrl}`,
    '',
    data.selectionBasis,
  ].join('\n');
}

export class UsageError extends Error {}

/**
 * Run the CLI with the given arguments.
 * @param {string[]} argv
 * @returns {{ code: number, stdout: string, stderr: string }}
 */
export function main(argv) {
  const [command, arg, ...rest] = argv;
  try {
    if (command === undefined || command === 'help' || command === '--help' || command === '-h') {
      return { code: 0, stdout: USAGE, stderr: '' };
    }
    if (rest.length > 0) throw new UsageError(`too many arguments for "${command}".`);
    switch (command) {
      case 'simulate': {
        if (!arg) throw new UsageError('simulate needs a scenario id or "all".');
        if (arg === 'all') {
          return { code: 0, stdout: `${scenarios.map(renderScenario).join('\n\n')}\n`, stderr: '' };
        }
        const scenario = getScenario(arg);
        if (!scenario) throw new UsageError(`unknown scenario ${JSON.stringify(arg)}. Known: ${scenarios.map((s) => s.id).join(', ')}.`);
        return { code: 0, stdout: `${renderScenario(scenario)}\n`, stderr: '' };
      }
      case 'list':
        if (arg !== undefined) throw new UsageError('list takes no argument.');
        return { code: 0, stdout: `${renderList()}\n`, stderr: '' };
      case 'issue': {
        if (!arg || normaliseIssueId(arg) === null) throw new UsageError('issue needs an id from 001 to 100.');
        return { code: 0, stdout: `${renderIssue(arg)}\n`, stderr: '' };
      }
      case 'routes':
        if (arg !== undefined) throw new UsageError('routes takes no argument.');
        return { code: 0, stdout: `${renderRoutes()}\n`, stderr: '' };
      case 'org':
        if (!arg) throw new UsageError('org needs a number from 1 to 13.');
        return { code: 0, stdout: `${renderOrg(arg)}\n`, stderr: '' };
      default:
        throw new UsageError(`unknown command ${JSON.stringify(command)}.`);
    }
  } catch (err) {
    if (err instanceof UsageError || err instanceof UnknownIssueError) {
      return { code: 2, stdout: '', stderr: `error: ${err.message}\n\n${USAGE}` };
    }
    throw err;
  }
}

/**
 * True when this file is the script Node was asked to run (not when imported by tests).
 * @returns {boolean}
 */
function isEntryPoint() {
  if (!process.argv[1]) return false;
  try {
    return resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  const result = main(process.argv.slice(2));
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exitCode = result.code;
}
