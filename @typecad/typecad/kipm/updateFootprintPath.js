import updateFootprintPathInNode from './updateFootprintPathInNode.js';
import deserializeLisp from './deserializeLisp.js';
import serializeLisp from './serializeLisp.js';

function updateFootprintPath(content, projectName) {
  // Parse the content into a structured format
  const parsed = deserializeLisp(content);
  
  // Update the footprint paths in the parsed structure
  const updated = updateFootprintPathInNode(parsed, projectName);
  
  // Serialize back to string format
  return serializeLisp(updated);
}

export default updateFootprintPath;
