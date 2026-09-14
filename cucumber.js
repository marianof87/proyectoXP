/**
 * Configuracion de Cucumber.
 *
 * `parallel` se ha eliminado a proposito: los escenarios comparten el mismo
 * World en memoria y ejecutarlos en paralelo introducia carreras.
 */
module.exports = {
  default: {
    paths: ['features/**/*.feature'],
    require: ['tests/support/**/*.ts', 'tests/step_definitions/**/*.ts'],
    requireModule: ['ts-node/register'],
    format: ['progress-bar', 'summary', 'html:reports/cucumber-report.html'],
    formatOptions: { snippetInterface: 'async-await' },
    // Falla la suite si queda algun paso sin implementar o ambiguo.
    strict: true,
  },
};
