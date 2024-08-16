import { cmd } from './cmd';

export class GitUtil {
  static async cloneAppTemplatePackages(directory: string): Promise<void> {
    const args = ['clone', 'https://github.com/brentbahry/app-template.git', directory];
    let envVars;
    if (directory) {
      envVars = { cwd: directory };
    }
    await cmd('git', args, envVars);
  }

  static async init(directory: string): Promise<void> {
    const args = ['init'];
    let envVars;
    if (directory) {
      envVars = { cwd: directory };
    }
    await cmd('git', args, envVars);
  }

  static async setRemote(directory: string, remote: string): Promise<void> {
    const args = ['remote', 'set-url', 'origin', remote];
    let envVars;
    if (directory) {
      envVars = { cwd: directory };
    }
    await cmd('git', args, envVars);
  }

  static async addRemote(directory: string, remote: string): Promise<void> {
    const args = ['remote', 'add', 'origin', remote];
    let envVars;
    if (directory) {
      envVars = { cwd: directory };
    }
    await cmd('git', args, envVars);
  }

  static async commit(directory: string, message: string): Promise<void> {
    const args = ['commit', '-m', message];
    let envVars;
    if (directory) {
      envVars = { cwd: directory };
    }
    await cmd('git', args, envVars);
  }

  static async pull(directory: string): Promise<void> {
    const args = ['pull'];
    let envVars;
    if (directory) {
      envVars = { cwd: directory };
    }
    await cmd('git', args, envVars);
  }

  static async push(directory: string): Promise<void> {
    const args = ['push'];
    let envVars;
    if (directory) {
      envVars = { cwd: directory };
    }
    await cmd('git', args, envVars);
  }

  static async status(directory: string): Promise<void> {
    const args = ['status'];
    let envVars;
    if (directory) {
      envVars = { cwd: directory };
    }
    await cmd('git', args, envVars);
  }

  static async addAll(directory: string): Promise<void> {
    const args = ['add', '.'];
    let envVars;
    if (directory) {
      envVars = { cwd: directory };
    }
    await cmd('git', args, envVars);
  }

  static async sync(directory: string): Promise<void> {
    await GitUtil.pull(directory);
    await GitUtil.push(directory);
  }
}

export const cloneAppTemplatePackagesFunctionName = 'cloneAppTemplatePackages';
export const cloneAppTemplatePackagesFunction = {
  definition: {
    name: cloneAppTemplatePackagesFunctionName,
    description: 'Clone the app template packages to the specified directory',
    parameters: {
      type: 'object',
      properties: {
        directory: {
          type: 'string',
          description: 'The directory to clone the packages to',
        },
      },
      required: ['directory'],
    },
  },
  call: async (params: { directory: string }) => await GitUtil.cloneAppTemplatePackages(params.directory),
};

export const initFunctionName = 'gitInit';
export const initFunction = {
  definition: {
    name: initFunctionName,
    description: 'Initialize a new git repository in the specified directory',
    parameters: {
      type: 'object',
      properties: {
        directory: {
          type: 'string',
          description: 'The directory to initialize the git repository in',
        },
      },
      required: ['directory'],
    },
  },
  call: async (params: { directory: string }) => await GitUtil.init(params.directory),
};

export const setRemoteFunctionName = 'gitSetRemote';
export const setRemoteFunction = {
  definition: {
    name: setRemoteFunctionName,
    description: 'Set the remote of the git repository in the specified directory',
    parameters: {
      type: 'object',
      properties: {
        directory: {
          type: 'string',
          description: 'The directory of the git repository',
        },
        remote: {
          type: 'string',
          description: 'The remote to set',
        },
      },
      required: ['directory', 'remote'],
    },
  },
  call: async (params: { directory: string; remote: string }) =>
    await GitUtil.setRemote(params.directory, params.remote),
};

export const addRemoteFunctionName = 'gitAddRemote';
export const addRemoteFunction = {
  definition: {
    name: addRemoteFunctionName,
    description: 'Add a remote to the git repository in the specified directory',
    parameters: {
      type: 'object',
      properties: {
        directory: {
          type: 'string',
          description: 'The directory of the git repository',
        },
        remote: {
          type: 'string',
          description: 'The remote to add',
        },
      },
      required: ['directory', 'remote'],
    },
  },
  call: async (params: { directory: string; remote: string }) =>
    await GitUtil.addRemote(params.directory, params.remote),
};

export const commitFunctionName = 'gitCommit';
export const commitFunction = {
  definition: {
    name: commitFunctionName,
    description: 'Commit changes in the git repository in the specified directory',
    parameters: {
      type: 'object',
      properties: {
        directory: {
          type: 'string',
          description: 'The directory of the git repository',
        },
        message: {
          type: 'string',
          description: 'The commit message',
        },
      },
      required: ['directory', 'message'],
    },
  },
  call: async (params: { directory: string; message: string }) =>
    await GitUtil.commit(params.directory, params.message),
};

export const pullFunctionName = 'gitPull';
export const pullFunction = {
  definition: {
    name: pullFunctionName,
    description: 'Pull changes from the remote of the git repository in the specified directory',
    parameters: {
      type: 'object',
      properties: {
        directory: {
          type: 'string',
          description: 'The directory of the git repository',
        },
      },
      required: ['directory'],
    },
  },
  call: async (params: { directory: string }) => await GitUtil.pull(params.directory),
};

export const pushFunctionName = 'gitPush';
export const pushFunction = {
  definition: {
    name: pushFunctionName,
    description: 'Push changes to the remote of the git repository in the specified directory',
    parameters: {
      type: 'object',
      properties: {
        directory: {
          type: 'string',
          description: 'The directory of the git repository',
        },
      },
      required: ['directory'],
    },
  },
  call: async (params: { directory: string }) => await GitUtil.push(params.directory),
};

export const statusFunctionName = 'gitStatus';
export const statusFunction = {
  definition: {
    name: statusFunctionName,
    description: 'Get the status of the git repository in the specified directory',
    parameters: {
      type: 'object',
      properties: {
        directory: {
          type: 'string',
          description: 'The directory of the git repository',
        },
      },
      required: ['directory'],
    },
  },
  call: async (params: { directory: string }) => await GitUtil.status(params.directory),
};

export const addAllFunctionName = 'gitAddAll';
export const addAllFunction = {
  definition: {
    name: addAllFunctionName,
    description: 'Add all changes in the git repository in the specified directory',
    parameters: {
      type: 'object',
      properties: {
        directory: {
          type: 'string',
          description: 'The directory of the git repository',
        },
      },
      required: ['directory'],
    },
  },
  call: async (params: { directory: string }) => await GitUtil.addAll(params.directory),
};

export const syncFunctionName = 'gitSync';
export const syncFunction = {
  definition: {
    name: syncFunctionName,
    description: 'Perform a pull then a push in the git repository in the specified directory',
    parameters: {
      type: 'object',
      properties: {
        directory: {
          type: 'string',
          description: 'The directory of the git repository',
        },
      },
      required: ['directory'],
    },
  },
  call: async (params: { directory: string }) => await GitUtil.sync(params.directory),
};

export const gitFunctions = [
  cloneAppTemplatePackagesFunction,
  initFunction,
  setRemoteFunction,
  addRemoteFunction,
  commitFunction,
  pullFunction,
  pushFunction,
  statusFunction,
  addAllFunction,
  syncFunction,
];
