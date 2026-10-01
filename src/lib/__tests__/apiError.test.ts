import { describe, it, expect } from 'vitest';
import { errorMessage } from '../apiError';

describe('errorMessage', () => {
  it('error vacío → mensaje genérico', () => {
    expect(errorMessage(null)).toBe('Error desconocido');
    expect(errorMessage(undefined)).toBe('Error desconocido');
    expect(errorMessage('')).toBe('Error desconocido');
  });

  it('strings pasan directo', () => {
    expect(errorMessage('boom')).toBe('boom');
  });

  it('extrae .message de objetos', () => {
    expect(errorMessage(new Error('fallo'))).toBe('fallo');
    expect(errorMessage({ message: 'fallo' })).toBe('fallo');
    expect(errorMessage({ message: 42 })).toBe('42');
  });

  it('otros valores se convierten a string', () => {
    expect(errorMessage(123)).toBe('123');
    expect(errorMessage({})).toBe('[object Object]');
  });
});
