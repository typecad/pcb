#!/usr/bin/env node

import { MCPServer } from './server';
import { HttpTransport } from './http-transport';
import { registerEchoTool } from './tools/echo';
import { registerCreateProjectTool } from './tools/create_project';
import { registerAddComponentTool } from './tools/add_component';
import { registerPdfToTextTool } from './tools/pdf_to_text';
import { registerDownloadTypeCadDocsTool } from './tools/download_typecad_docs';
import { registerValidateComponentTool } from './tools/validate_component';
import { registerCreatePackageTool } from './tools/create_package';
import { registerAddResistorTool } from './tools/add_resistor';
import { registerAddCapacitorTool } from './tools/add_capacitor';
import { registerAddDiodeTool } from './tools/add_diode';
import { registerAddInductorTool } from './tools/add_inductor';
import { registerAddFuseTool } from './tools/add_fuse';
import { registerAddLedTool } from './tools/add_led';
import { registerAddConnectorTool } from './tools/add_connector';
import { registerAddTestpointTool } from './tools/add_testpoint';
import { registerAddPowerSourceTool } from './tools/add_power_source';
import { registerCreateNamedNetTool } from './tools/create_named_net';
import { registerAddViaTool } from './tools/add_via';
import { registerAddTrackTool } from './tools/add_track';
import { registerAddPowerInputTool } from './tools/add_power_input';
import { registerCreateCustomComponentTool } from './tools/create_custom_component';
import { registerSetComponentPropertiesTool } from './tools/set_component_properties';
import { registerValidateDesignTool } from './tools/validate_design';
import { registerRunErcTool } from './tools/run_erc';
import { registerConnectPinsTool } from './tools/connect_pins';
import { registerSearchJLCPCBComponentsTool } from './tools/search_jlcpcb_components';
import { registerSearchLocalComponentsTool, registerIndexLocalComponentsTool } from './tools/search_local_components';
import { registerSearchAllComponentsTool } from './tools/search_all_components';
import { registerDesignCircuitTool } from './tools/design_circuit';

// Create server instance
const server = new MCPServer();

// Register tools
registerEchoTool(server);
registerCreateProjectTool(server);
registerAddComponentTool(server);
registerPdfToTextTool(server);
registerDownloadTypeCadDocsTool(server);
registerValidateComponentTool(server);
registerCreatePackageTool(server);
registerAddResistorTool(server);
registerAddCapacitorTool(server);
registerAddDiodeTool(server);
registerAddInductorTool(server);
registerAddFuseTool(server);
registerAddLedTool(server);
registerAddConnectorTool(server);
registerAddTestpointTool(server);
registerAddMountingHoleTool(server);
registerAddPowerSourceTool(server);
registerCreateNamedNetTool(server);
registerAddViaTool(server);
registerAddTrackTool(server);
registerAddPowerInputTool(server);
registerCreateCustomComponentTool(server);
registerSetComponentPropertiesTool(server);
registerValidateDesignTool(server);
registerRunErcTool(server);
registerConnectPinsTool(server);
registerSearchJLCPCBComponentsTool(server);
registerSearchLocalComponentsTool(server);
registerIndexLocalComponentsTool(server);
registerSearchAllComponentsTool(server);
registerDesignCircuitTool(server);

// Get port from environment variable or default to 3000
const port = parseInt(process.env.PORT || '3000', 10);

// Start the HTTP server
const transport = new HttpTransport(server, port);

async function startServer() {
  try {
    await transport.start();
    console.log(`typeCAD MCP Server is running on port ${port}`);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down server...');
  process.exit(0);
});

startServer();