import { Graph, json } from '@dagrejs/graphlib';
import { jsonCycle } from '../jsonCycle';
import jsesc from 'jsesc';

export const graphSerializer = {
	serialize: function(graph: Graph): string {
		const graphJson = json.write(graph);
		const decycledJson = jsonCycle.decycle(graphJson);
		return jsesc(decycledJson, { json: true });
	},
	deserialize: function(serializedGraph: string): Graph {
		const decycledJson = JSON.parse(serializedGraph);
		const graphJson = jsonCycle.retrocycle(decycledJson);
		return json.read(graphJson);
	}
};