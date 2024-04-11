/** Load Dependency Source Graphs */

import '@proteinjs/reflection';


/** Generate Source Graph */

const sourceGraph = "{\"options\":{\"directed\":true,\"multigraph\":false,\"compound\":false},\"nodes\":[{\"v\":\"@proteinjs/server-api/RequestListener\",\"value\":{\"packageName\":\"@proteinjs/server-api\",\"name\":\"RequestListener\",\"filePath\":\"/Users/brentbahry/repos/components/server/api/src/RequestListener.ts\",\"qualifiedName\":\"@proteinjs/server-api/RequestListener\",\"properties\":[],\"methods\":[{\"name\":\"beforeRequest\",\"returnType\":{\"packageName\":\"\",\"name\":\"Promise<void>\",\"filePath\":null,\"qualifiedName\":\"/Promise<void>\",\"typeParameters\":null,\"directParents\":null},\"isAsync\":false,\"isOptional\":true,\"isAbstract\":true,\"isStatic\":false,\"visibility\":\"public\",\"parameters\":[{\"name\":\"request\",\"type\":{\"packageName\":\"\",\"name\":\"express.Request\",\"filePath\":null,\"qualifiedName\":\"/express.Request\",\"typeParameters\":null,\"directParents\":null}},{\"name\":\"response\",\"type\":{\"packageName\":\"\",\"name\":\"express.Response\",\"filePath\":null,\"qualifiedName\":\"/express.Response\",\"typeParameters\":null,\"directParents\":null}}]},{\"name\":\"afterRequest\",\"returnType\":{\"packageName\":\"\",\"name\":\"Promise<void>\",\"filePath\":null,\"qualifiedName\":\"/Promise<void>\",\"typeParameters\":null,\"directParents\":null},\"isAsync\":false,\"isOptional\":true,\"isAbstract\":true,\"isStatic\":false,\"visibility\":\"public\",\"parameters\":[{\"name\":\"request\",\"type\":{\"packageName\":\"\",\"name\":\"express.Request\",\"filePath\":null,\"qualifiedName\":\"/express.Request\",\"typeParameters\":null,\"directParents\":null}},{\"name\":\"response\",\"type\":{\"packageName\":\"\",\"name\":\"express.Response\",\"filePath\":null,\"qualifiedName\":\"/express.Response\",\"typeParameters\":null,\"directParents\":null}}]}],\"typeParameters\":[],\"directParents\":[{\"packageName\":\"@proteinjs/reflection\",\"name\":\"Loadable\",\"filePath\":null,\"qualifiedName\":\"@proteinjs/reflection/Loadable\",\"properties\":[],\"methods\":[],\"typeParameters\":[],\"directParents\":[]}],\"sourceType\":3}},{\"v\":\"@proteinjs/reflection/Loadable\"},{\"v\":\"@proteinjs/server-api/Route\",\"value\":{\"packageName\":\"@proteinjs/server-api\",\"name\":\"Route\",\"filePath\":\"/Users/brentbahry/repos/components/server/api/src/Route.ts\",\"qualifiedName\":\"@proteinjs/server-api/Route\",\"properties\":[{\"name\":\"path\",\"type\":{\"packageName\":\"\",\"name\":\"string\",\"filePath\":null,\"qualifiedName\":\"/string\",\"typeParameters\":null,\"directParents\":null},\"isOptional\":false,\"isAbstract\":false,\"isStatic\":false,\"visibility\":\"public\"},{\"name\":\"method\",\"type\":{\"packageName\":\"\",\"name\":\"'get'|'post'|'put'|'patch'|'delete'\",\"filePath\":null,\"qualifiedName\":\"/'get'|'post'|'put'|'patch'|'delete'\",\"typeParameters\":null,\"directParents\":null},\"isOptional\":false,\"isAbstract\":false,\"isStatic\":false,\"visibility\":\"public\"},{\"name\":\"useHttp\",\"type\":{\"packageName\":\"\",\"name\":\"boolean\",\"filePath\":null,\"qualifiedName\":\"/boolean\",\"typeParameters\":null,\"directParents\":null},\"isOptional\":true,\"isAbstract\":false,\"isStatic\":false,\"visibility\":\"public\"},{\"name\":\"onRequest\",\"type\":{\"packageName\":\"\",\"name\":\"(request: express.Request, response: express.Response) => Promise<void>\",\"filePath\":null,\"qualifiedName\":\"/(request: express.Request, response: express.Response) => Promise<void>\",\"typeParameters\":null,\"directParents\":null},\"isOptional\":false,\"isAbstract\":false,\"isStatic\":false,\"visibility\":\"public\"}],\"methods\":[],\"typeParameters\":[],\"directParents\":[{\"packageName\":\"@proteinjs/reflection\",\"name\":\"Loadable\",\"filePath\":null,\"qualifiedName\":\"@proteinjs/reflection/Loadable\",\"properties\":[],\"methods\":[],\"typeParameters\":[],\"directParents\":[]}],\"sourceType\":3}},{\"v\":\"@proteinjs/server-api/ServerRenderedScript\",\"value\":{\"packageName\":\"@proteinjs/server-api\",\"name\":\"ServerRenderedScript\",\"filePath\":\"/Users/brentbahry/repos/components/server/api/src/ServerRenderedScript.ts\",\"qualifiedName\":\"@proteinjs/server-api/ServerRenderedScript\",\"properties\":[],\"methods\":[{\"name\":\"script\",\"returnType\":{\"packageName\":\"\",\"name\":\"Promise<string>\",\"filePath\":null,\"qualifiedName\":\"/Promise<string>\",\"typeParameters\":null,\"directParents\":null},\"isAsync\":false,\"isOptional\":false,\"isAbstract\":true,\"isStatic\":false,\"visibility\":\"public\",\"parameters\":[]}],\"typeParameters\":[],\"directParents\":[{\"packageName\":\"@proteinjs/reflection\",\"name\":\"Loadable\",\"filePath\":null,\"qualifiedName\":\"@proteinjs/reflection/Loadable\",\"properties\":[],\"methods\":[],\"typeParameters\":[],\"directParents\":[]}],\"sourceType\":3}},{\"v\":\"@proteinjs/server-api/BrowserSessionDataStorage\",\"value\":{\"packageName\":\"@proteinjs/server-api\",\"name\":\"BrowserSessionDataStorage\",\"filePath\":\"/Users/brentbahry/repos/components/server/api/src/session/BrowserSessionDataStorage.ts\",\"qualifiedName\":\"@proteinjs/server-api/BrowserSessionDataStorage\",\"isAbstract\":false,\"isStatic\":false,\"visibility\":\"public\",\"properties\":[{\"name\":\"environment\",\"type\":null,\"isOptional\":false,\"isAbstract\":false,\"isStatic\":false,\"visibility\":\"public\"}],\"methods\":[{\"name\":\"setData\",\"returnType\":null,\"isAsync\":false,\"isOptional\":false,\"isAbstract\":false,\"isStatic\":false,\"visibility\":\"public\",\"parameters\":[{\"name\":\"data\",\"type\":{\"packageName\":\"@proteinjs/server-api\",\"name\":\"SessionData\",\"filePath\":null,\"qualifiedName\":\"@proteinjs/server-api/SessionData\",\"typeParameters\":null,\"directParents\":null}}]},{\"name\":\"getData\",\"returnType\":{\"packageName\":\"@proteinjs/server-api\",\"name\":\"SessionData\",\"filePath\":null,\"qualifiedName\":\"@proteinjs/server-api/SessionData\",\"typeParameters\":null,\"directParents\":null},\"isAsync\":false,\"isOptional\":false,\"isAbstract\":false,\"isStatic\":false,\"visibility\":\"public\",\"parameters\":[]}],\"typeParameters\":[],\"directParentInterfaces\":[{\"packageName\":\"@proteinjs/server-api\",\"name\":\"SessionDataStorage\",\"filePath\":null,\"qualifiedName\":\"@proteinjs/server-api/SessionDataStorage\",\"properties\":[],\"methods\":[],\"typeParameters\":[],\"directParents\":[]}],\"directParentClasses\":[],\"sourceType\":2}},{\"v\":\"@proteinjs/server-api/SessionDataStorage\",\"value\":{\"packageName\":\"@proteinjs/server-api\",\"name\":\"SessionDataStorage\",\"filePath\":\"/Users/brentbahry/repos/components/server/api/src/session/Session.ts\",\"qualifiedName\":\"@proteinjs/server-api/SessionDataStorage\",\"properties\":[{\"name\":\"environment\",\"type\":{\"packageName\":\"\",\"name\":\"'node'|'browser'\",\"filePath\":null,\"qualifiedName\":\"/'node'|'browser'\",\"typeParameters\":null,\"directParents\":null},\"isOptional\":false,\"isAbstract\":false,\"isStatic\":false,\"visibility\":\"public\"}],\"methods\":[{\"name\":\"setData\",\"returnType\":{\"packageName\":\"\",\"name\":\"void\",\"filePath\":null,\"qualifiedName\":\"/void\",\"typeParameters\":null,\"directParents\":null},\"isAsync\":false,\"isOptional\":false,\"isAbstract\":true,\"isStatic\":false,\"visibility\":\"public\",\"parameters\":[{\"name\":\"data\",\"type\":{\"packageName\":\"@proteinjs/server-api\",\"name\":\"SessionData\",\"filePath\":null,\"qualifiedName\":\"@proteinjs/server-api/SessionData\",\"typeParameters\":null,\"directParents\":null}}]},{\"name\":\"getData\",\"returnType\":{\"packageName\":\"@proteinjs/server-api\",\"name\":\"SessionData\",\"filePath\":null,\"qualifiedName\":\"@proteinjs/server-api/SessionData\",\"typeParameters\":null,\"directParents\":null},\"isAsync\":false,\"isOptional\":false,\"isAbstract\":true,\"isStatic\":false,\"visibility\":\"public\",\"parameters\":[]}],\"typeParameters\":[],\"directParents\":[{\"packageName\":\"@proteinjs/reflection\",\"name\":\"Loadable\",\"filePath\":null,\"qualifiedName\":\"@proteinjs/reflection/Loadable\",\"properties\":[],\"methods\":[],\"typeParameters\":[],\"directParents\":[]}],\"sourceType\":3}},{\"v\":\"@proteinjs/server-api/SessionDataCache\",\"value\":{\"packageName\":\"@proteinjs/server-api\",\"name\":\"SessionDataCache\",\"filePath\":\"/Users/brentbahry/repos/components/server/api/src/session/SessionDataCache.ts\",\"qualifiedName\":\"@proteinjs/server-api/SessionDataCache\",\"properties\":[{\"name\":\"key\",\"type\":{\"packageName\":\"\",\"name\":\"string\",\"filePath\":null,\"qualifiedName\":\"/string\",\"typeParameters\":null,\"directParents\":null},\"isOptional\":false,\"isAbstract\":false,\"isStatic\":false,\"visibility\":\"public\"}],\"methods\":[{\"name\":\"create\",\"returnType\":{\"packageName\":\"\",\"name\":\"Promise<T>\",\"filePath\":null,\"qualifiedName\":\"/Promise<T>\",\"typeParameters\":null,\"directParents\":null},\"isAsync\":false,\"isOptional\":false,\"isAbstract\":true,\"isStatic\":false,\"visibility\":\"public\",\"parameters\":[{\"name\":\"sessionId\",\"type\":{\"packageName\":\"\",\"name\":\"string|undefined\",\"filePath\":null,\"qualifiedName\":\"/string|undefined\",\"typeParameters\":null,\"directParents\":null}},{\"name\":\"user\",\"type\":{\"packageName\":\"\",\"name\":\"string|undefined\",\"filePath\":null,\"qualifiedName\":\"/string|undefined\",\"typeParameters\":null,\"directParents\":null}}]}],\"typeParameters\":[\"/T\"],\"directParents\":[{\"packageName\":\"@proteinjs/reflection\",\"name\":\"Loadable\",\"filePath\":null,\"qualifiedName\":\"@proteinjs/reflection/Loadable\",\"properties\":[],\"methods\":[],\"typeParameters\":[],\"directParents\":[]}],\"sourceType\":3}},{\"v\":\"@proteinjs/server-api/SessionDataScriptTag\",\"value\":{\"packageName\":\"@proteinjs/server-api\",\"name\":\"SessionDataScriptTag\",\"filePath\":\"/Users/brentbahry/repos/components/server/api/src/session/SessionDataScriptTag.ts\",\"qualifiedName\":\"@proteinjs/server-api/SessionDataScriptTag\",\"isAbstract\":false,\"isStatic\":false,\"visibility\":\"public\",\"properties\":[],\"methods\":[{\"name\":\"script\",\"returnType\":{\"packageName\":\"\",\"name\":\"Promise<string>\",\"filePath\":null,\"qualifiedName\":\"/Promise<string>\",\"typeParameters\":null,\"directParents\":null},\"isAsync\":true,\"isOptional\":false,\"isAbstract\":false,\"isStatic\":false,\"visibility\":\"public\",\"parameters\":[]}],\"typeParameters\":[],\"directParentInterfaces\":[{\"packageName\":\"@proteinjs/server-api\",\"name\":\"ServerRenderedScript\",\"filePath\":null,\"qualifiedName\":\"@proteinjs/server-api/ServerRenderedScript\",\"properties\":[],\"methods\":[],\"typeParameters\":[],\"directParents\":[]}],\"directParentClasses\":[],\"sourceType\":2}}],\"edges\":[{\"v\":\"@proteinjs/server-api/RequestListener\",\"w\":\"@proteinjs/reflection/Loadable\",\"value\":\"extends interface\"},{\"v\":\"@proteinjs/server-api/Route\",\"w\":\"@proteinjs/reflection/Loadable\",\"value\":\"extends interface\"},{\"v\":\"@proteinjs/server-api/ServerRenderedScript\",\"w\":\"@proteinjs/reflection/Loadable\",\"value\":\"extends interface\"},{\"v\":\"@proteinjs/server-api/BrowserSessionDataStorage\",\"w\":\"@proteinjs/server-api/SessionDataStorage\",\"value\":\"implements interface\"},{\"v\":\"@proteinjs/server-api/SessionDataStorage\",\"w\":\"@proteinjs/reflection/Loadable\",\"value\":\"extends interface\"},{\"v\":\"@proteinjs/server-api/SessionDataCache\",\"w\":\"@proteinjs/reflection/Loadable\",\"value\":\"extends interface\"},{\"v\":\"@proteinjs/server-api/SessionDataScriptTag\",\"w\":\"@proteinjs/server-api/ServerRenderedScript\",\"value\":\"implements interface\"}]}";


/** Generate Source Links */

import { BrowserSessionDataStorage } from '../src/session/BrowserSessionDataStorage';
import { SessionDataScriptTag } from '../src/session/SessionDataScriptTag';

const sourceLinks = {
	'@proteinjs/server-api/BrowserSessionDataStorage': BrowserSessionDataStorage,
	'@proteinjs/server-api/SessionDataScriptTag': SessionDataScriptTag,
};


/** Load Source Graph and Links */

import { SourceRepository } from '@proteinjs/reflection';
SourceRepository.merge(sourceGraph, sourceLinks);


export * from '../index';