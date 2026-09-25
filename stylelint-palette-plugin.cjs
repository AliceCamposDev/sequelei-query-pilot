const stylelint = require('stylelint');

const ruleName = 'sequelei/palette';
const messages = stylelint.utils.ruleMessages(ruleName, {
  rejected: (value) => `Unexpected color literal "${value}"; use a palette token instead.`,
});

const rule = (primary) => (root, result) => {
  if (primary !== true) {
    return;
  }

  root.walkDecls((declaration) => {
    const colorLiteral = declaration.value.match(/#[0-9a-f]{3,8}/i)?.[0];

    if (colorLiteral) {
      stylelint.utils.report({
        message: messages.rejected(colorLiteral),
        node: declaration,
        result,
        ruleName,
      });
    }
  });
};

rule.ruleName = ruleName;
rule.messages = messages;

module.exports = stylelint.createPlugin(ruleName, rule);
module.exports.ruleName = ruleName;
module.exports.messages = messages;
