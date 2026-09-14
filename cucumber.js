{
  "default": {
    "paths": ["features/**/*.feature"],
    "require": ["tests/step_definitions/**/*.ts"],
    "requireModule": ["ts-node/register"],
    "format": ["progress-bar", "html:reports/cucumber-report.html"],
    "parallel": 2
  }
}
