import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TriageManager } from '../../src/review/triage.manager';

describe('TriageManager', () => {
  let triage: TriageManager;

  beforeEach(() => {
    triage = new TriageManager();
  });

  describe('getState / setState', () => {
    it('returns "unreviewed" for unknown files', () => {
      expect(triage.getState('/some/file.ts')).toBe('unreviewed');
    });

    it('stores and retrieves a state', () => {
      // Act
      triage.setState('/file.ts', 'reviewed');

      // Assert
      expect(triage.getState('/file.ts')).toBe('reviewed');
    });

    it('overwrites a previous state', () => {
      // Arrange
      triage.setState('/file.ts', 'reviewed');

      // Act
      triage.setState('/file.ts', 'flagged');

      // Assert
      expect(triage.getState('/file.ts')).toBe('flagged');
    });

    it('fires the onChange callback on every state change', () => {
      // Arrange
      const spy = vi.fn();
      triage.setOnChange(spy);

      // Act
      triage.setState('/a.ts', 'reviewed');
      triage.setState('/b.ts', 'flagged');

      // Assert
      expect(spy).toHaveBeenCalledTimes(2);
    });
  });

  describe('computeStats', () => {
    it('counts states across the given file list', () => {
      // Arrange
      triage.setState('/a.ts', 'reviewed');
      triage.setState('/b.ts', 'flagged');
      // /c.ts not set → defaults to unreviewed

      // Act
      const stats = triage.computeStats(['/a.ts', '/b.ts', '/c.ts']);

      // Assert
      expect(stats).toEqual({
        total: 3,
        reviewed: 1,
        flagged: 1,
        unreviewed: 1,
      });
    });

    it('returns zeros for an empty file list', () => {
      // Arrange / Act
      const stats = triage.computeStats([]);

      // Assert
      expect(stats).toEqual({ total: 0, reviewed: 0, flagged: 0, unreviewed: 0 });
    });
  });

  describe('computeAggregateState', () => {
    it('returns "flagged" when any file is flagged', () => {
      // Arrange
      triage.setState('/a.ts', 'reviewed');
      triage.setState('/b.ts', 'flagged');

      // Act / Assert
      expect(triage.computeAggregateState(['/a.ts', '/b.ts'])).toBe('flagged');
    });

    it('returns "reviewed" when all files are reviewed', () => {
      // Arrange
      triage.setState('/a.ts', 'reviewed');
      triage.setState('/b.ts', 'reviewed');

      // Act / Assert
      expect(triage.computeAggregateState(['/a.ts', '/b.ts'])).toBe('reviewed');
    });

    it('returns "unreviewed" for mixed reviewed/unreviewed without flags', () => {
      // Arrange
      triage.setState('/a.ts', 'reviewed');
      // /b.ts defaults to unreviewed

      // Act / Assert
      expect(triage.computeAggregateState(['/a.ts', '/b.ts'])).toBe('unreviewed');
    });

    it('returns "unreviewed" for an empty list', () => {
      expect(triage.computeAggregateState([])).toBe('unreviewed');
    });
  });

  describe('toJSON / fromJSON', () => {
    it('round-trips state through serialisation', () => {
      // Arrange
      triage.setState('/a.ts', 'reviewed');
      triage.setState('/b.ts', 'flagged');

      // Act
      const json = triage.toJSON();
      const other = new TriageManager();
      other.fromJSON(json);

      // Assert
      expect(other.getState('/a.ts')).toBe('reviewed');
      expect(other.getState('/b.ts')).toBe('flagged');
      expect(other.getState('/c.ts')).toBe('unreviewed');
    });

    it('clears previous state on fromJSON', () => {
      // Arrange
      triage.setState('/old.ts', 'flagged');

      // Act
      triage.fromJSON({ '/new.ts': 'reviewed' });

      // Assert
      expect(triage.getState('/old.ts')).toBe('unreviewed');
      expect(triage.getState('/new.ts')).toBe('reviewed');
    });
  });
});
