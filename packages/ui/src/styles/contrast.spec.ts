import { describe, expect, it } from 'vitest';

function channel(value: number) {
  const normalized = value / 255;

  return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function contrastRatio(foreground: string, background: string) {
  const parse = (color: string) => {
    const values = color.match(/[a-f\d]{2}/gi)?.map((value) => Number.parseInt(value, 16));

    if (!values || values.length !== 3) {
      throw new Error(`Cor inválida: ${color}`);
    }

    const [red, green, blue] = values as [number, number, number];
    return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
  };

  const foregroundLuminance = parse(foreground);
  const backgroundLuminance = parse(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

describe('contraste dos temas', () => {
  it('mantém contraste AA para texto normal', () => {
    const pairs: Array<[string, string]> = [
      ['#e9e3f0', '#0b0814'],
      ['#acaad1', '#0b0814'],
      ['#171128', '#e9e3f0'],
      ['#4a3f6b', '#e9e3f0'],
      ['#6d4fd6', '#ffffff'],
      ['#c9457a', '#ffffff'],
    ];

    for (const [foreground, background] of pairs) {
      expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
