import { PCB, Component } from '@typecad/typecad';
// import { schematic } from '@typecad/schematic';

// Centralized routing resolution for all tests
export const RESOLUTION = 0.1; // Use 0.05mm for BGA fine-pitch routing
export const HEURISTIC = 2;

export const options = {
  gridResolution: 1,
  heuristicWeight: HEURISTIC,
  useAdaptiveStride: true,
};

// Create the main typecad object
const typecad = new PCB('autoroute_test');
// Test execution control
const runTests = {
  test1: true,
  test2: false,
  test3: false,
  test4: false,
  test5: false,
  test6: false,
  test7: false,
  test8: false,
  test9: false,
  test10: false,
  test11: false,
  test12: false, // errors
  test13: false,
  test14: false,
  test15: false, // errors
};

// Run individual test files based on configuration and collect all components
(async () => {
  const allComponents: Component[] = [];

  if (runTests.test1) {
    const { runTest1 } = await import('./tests/test1_basic_resistors');
    const components = runTest1(typecad);
    allComponents.push(...components);
  }
  if (runTests.test2) {
    const { runTest2 } = await import('./tests/test2_rotated_resistors');
    const components = runTest2(typecad);
    allComponents.push(...components);
  }
  if (runTests.test3) {
    const { runTest3 } = await import('./tests/test3_complex_routing');
    const components = runTest3(typecad);
    allComponents.push(...components);
  }
  if (runTests.test4) {
    const { runTest4 } = await import('./tests/test4_qfn_intersecting');
    const components = runTest4(typecad);
    allComponents.push(...components);
  }
  if (runTests.test5) {
    const { runTest5 } = await import('./tests/test5_multilayer_connectors');
    const components = runTest5(typecad);
    allComponents.push(...components);
  }
  if (runTests.test6) {
    const { runTest6 } = await import('./tests/test6_complex_connector_routing');
    const components = runTest6(typecad);
    allComponents.push(...components);
  }
  if (runTests.test7) {
    const { runTest7 } = await import('./tests/test7_dense_connector_array');
    const components = runTest7(typecad);
    allComponents.push(...components);
  }
  if (runTests.test8) {
    const { runTest8 } = await import('./tests/test8_multilayer_connector_maze');
    const components = runTest8(typecad);
    allComponents.push(...components);
  }
  if (runTests.test9) {
    const { runTest9 } = await import('./tests/test9_dsbga_complex_routing');
    const components = runTest9(typecad);
    allComponents.push(...components);
  }
  if (runTests.test10) {
    const { runTest10 } = await import('./tests/test10_keepout_area');
    const components = runTest10(typecad);
    allComponents.push(...components);
  }
  if (runTests.test11) {
    const { runTest11 } = await import('./tests/test11_length_match');
    const components = runTest11(typecad);
    allComponents.push(...components);
  }
  if (runTests.test12) {
    const { runTest12 } = await import('./tests/test12_differential_pairs');
    const components = runTest12(typecad);
    allComponents.push(...components);
  }
  if (runTests.test13) {
    const { runTest13 } = await import('./tests/test13_impedance_control');
    const components = runTest13(typecad);
    allComponents.push(...components);
  }
  if (runTests.test14) {
    const { runTest14 } = await import('./tests/test14_power_info');
    const components = runTest14(typecad);
    allComponents.push(...components);
  }
  if (runTests.test15) {
    const { runTest15 } = await import('./tests/test15_component');
    const components = runTest15(typecad);
    allComponents.push(...components);
  }
  // Create all components in a single call
  if (allComponents.length > 0) {
    typecad.create(...allComponents);
  }

  // schematic(typecad.Schematic);
})();
