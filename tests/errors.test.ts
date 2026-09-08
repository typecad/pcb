import { describe, it, expect } from 'vitest';
import {
  TypeCadError,
  RoutingError,
  ComponentError,
  BoardCreationError,
  KiCadNotFoundError,
} from '../src/utils/errors.js';

describe('Error hierarchy', () => {
  it('TypeCadError should have correct name and be instanceof Error', () => {
    const err = new TypeCadError('test');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(TypeCadError);
    expect(err.name).toBe('TypeCadError');
    expect(err.message).toBe('test');
  });

  it('RoutingError should extend TypeCadError', () => {
    const err = new RoutingError('route failed');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(TypeCadError);
    expect(err).toBeInstanceOf(RoutingError);
    expect(err.name).toBe('RoutingError');
    expect(err.message).toBe('route failed');
  });

  it('ComponentError should extend TypeCadError', () => {
    const err = new ComponentError('bad component');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(TypeCadError);
    expect(err).toBeInstanceOf(ComponentError);
    expect(err.name).toBe('ComponentError');
  });

  it('BoardCreationError should extend TypeCadError', () => {
    const err = new BoardCreationError('board failed');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(TypeCadError);
    expect(err).toBeInstanceOf(BoardCreationError);
    expect(err.name).toBe('BoardCreationError');
  });

  it('KiCadNotFoundError should extend TypeCadError', () => {
    const err = new KiCadNotFoundError('not found');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(TypeCadError);
    expect(err).toBeInstanceOf(KiCadNotFoundError);
    expect(err.name).toBe('KiCadNotFoundError');
  });

  it('should distinguish error types in catch blocks', () => {
    const throwRouting = () => {
      throw new RoutingError('r');
    };
    const throwComponent = () => {
      throw new ComponentError('c');
    };

    try {
      throwRouting();
    } catch (err) {
      expect(err).toBeInstanceOf(RoutingError);
      expect(err).not.toBeInstanceOf(ComponentError);
    }

    try {
      throwComponent();
    } catch (err) {
      expect(err).toBeInstanceOf(ComponentError);
      expect(err).not.toBeInstanceOf(RoutingError);
    }
  });
});
