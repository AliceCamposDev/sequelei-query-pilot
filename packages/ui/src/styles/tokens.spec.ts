import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const tokensCss = readFileSync('src/styles/tokens.css', 'utf8');

describe('design tokens', () => {
  it('mantém o snapshot dos tokens compilados', () => {
    expect(tokensCss).toMatchSnapshot();
  });

  it('mantém cores literais restritas ao arquivo de tokens', () => {
    const componentCss = readFileSync('src/styles.css', 'utf8');

    expect(componentCss).not.toMatch(/#[0-9a-f]{3,8}/i);
  });
});
