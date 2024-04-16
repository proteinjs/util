import { Graph, json as GraphJson } from '@dagrejs/graphlib';
import { jsonCycle } from '../jsonCycle';
import jsesc from 'jsesc';

export const graphSerializer = {
	serialize: function(graph: Graph): string {
		const graphJson = GraphJson.write(graph);
		const decycledJson = jsonCycle.decycle(graphJson);
		return jsesc(decycledJson, { json: true });
	},
	deserialize: function(serializedGraph: string): Graph {
		const decycledJson = JSON.parse(serializedGraph);
		const graphJson = jsonCycle.retrocycle(decycledJson);
		return GraphJson.read(graphJson);
	}
};