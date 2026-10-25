import { describe, expect, it } from 'vitest';
import { AGENTS, agentById, INSTRUCTION_BLOCK } from './agents';

describe('agent docs', () => {
  it('lists nine agents with unique ids', () => {
    expect(AGENTS).toHaveLength(9);
    expect(new Set(AGENTS.map((a) => a.id)).size).toBe(9);
  });

  it('points every snippet at the mcp endpoint', () => {
    for (const agent of AGENTS) {
      expect(agent.snippet('https://m.test'), agent.id).toContain('https://m.test/mcp');
      expect(agent.notes.length, agent.id).toBeGreaterThan(0);
    }
  });

  it('uses the config shape each client expects', () => {
    expect(agentById('opencode')?.snippet('https://m.test')).toContain('"type": "remote"');
    expect(agentById('codex')?.snippet('https://m.test')).toContain('[mcp_servers.mimir]');
    expect(agentById('gemini-cli')?.snippet('https://m.test')).toContain('"httpUrl"');
  });

  it('ships parseable json snippets', () => {
    for (const agent of AGENTS.filter((a) => a.id !== 'codex')) {
      expect(() => JSON.parse(agent.snippet('https://m.test')), agent.id).not.toThrow();
    }
  });

  it('returns undefined for an unknown agent', () => {
    expect(agentById('nope')).toBeUndefined();
  });

  it('tells the agent to digest first and never store secrets', () => {
    expect(INSTRUCTION_BLOCK).toContain('memory_digest');
    expect(INSTRUCTION_BLOCK).toContain('memory_write');
    expect(INSTRUCTION_BLOCK).toContain('Do not store secrets');
  });
});
