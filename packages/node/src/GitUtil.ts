import { cmd } from './cmd';
import type { LogOptions } from './cmd';

type LogPassThrough = { log?: LogOptions };

const DEFAULT_SILENT_LOG: LogOptions = {
  omitLogs: {
    stdout: { omit: true },
    stderr: { omit: true },
  },
};

export class GitUtil {
  static async cloneAppTemplatePackages(directory: string, opts?: LogPassThrough): Promise<void> {
    const args = ['clone', 'https://github.com/proteinjs/app-template.git', directory];
    const env = directory ? { cwd: directory } : undefined;
    await cmd('git', args, env, opts?.log);
  }

  static async init(directory: string, opts?: LogPassThrough): Promise<void> {
    const args = ['init'];
    const env = directory ? { cwd: directory } : undefined;
    await cmd('git', args, env, opts?.log);
  }

  static async setRemote(directory: string, remote: string, opts?: LogPassThrough): Promise<void> {
    const args = ['remote', 'set-url', 'origin', remote];
    const env = directory ? { cwd: directory } : undefined;
    await cmd('git', args, env, opts?.log);
  }

  static async addRemote(directory: string, remote: string, opts?: LogPassThrough): Promise<void> {
    const args = ['remote', 'add', 'origin', remote];
    const env = directory ? { cwd: directory } : undefined;
    await cmd('git', args, env, opts?.log);
  }

  static async commit(directory: string, message: string, opts?: LogPassThrough): Promise<void> {
    const args = ['commit', '-m', message];
    const env = directory ? { cwd: directory } : undefined;
    await cmd('git', args, env, opts?.log);
  }

  static async pull(directory: string, opts?: LogPassThrough): Promise<void> {
    const args = ['pull'];
    const env = directory ? { cwd: directory } : undefined;
    await cmd('git', args, env, opts?.log);
  }

  static async push(directory: string, opts?: LogPassThrough): Promise<void> {
    const args = ['push'];
    const env = directory ? { cwd: directory } : undefined;
    await cmd('git', args, env, opts?.log);
  }

  static async status(directory: string, opts?: LogPassThrough): Promise<void> {
    const args = ['status'];
    const env = directory ? { cwd: directory } : undefined;
    await cmd('git', args, env, opts?.log);
  }

  static async addAll(directory: string, opts?: LogPassThrough): Promise<void> {
    const args = ['add', '-A'];
    const env = directory ? { cwd: directory } : undefined;
    await cmd('git', args, env, opts?.log);
  }

  static async sync(directory: string, opts?: LogPassThrough): Promise<void> {
    await GitUtil.pull(directory, opts);
    await GitUtil.push(directory, opts);
  }

  /** Return the current branch name. */
  static async currentBranch(directory: string, opts?: LogPassThrough): Promise<string> {
    const args = ['rev-parse', '--abbrev-ref', 'HEAD'];
    const env = directory ? { cwd: directory } : undefined;
    const { stdout } = await cmd('git', args, env, opts?.log);
    return String(stdout ?? '').trim();
  }

  /** Return the current HEAD SHA. */
  static async headSha(directory: string, opts?: LogPassThrough): Promise<string> {
    const args = ['rev-parse', 'HEAD'];
    const env = directory ? { cwd: directory } : undefined;
    const { stdout } = await cmd('git', args, env, opts?.log);
    return String(stdout ?? '').trim();
  }

  /** Create and switch to a new branch. */
  static async createBranch(directory: string, name: string, opts?: LogPassThrough): Promise<void> {
    const args = ['checkout', '-b', name];
    const env = directory ? { cwd: directory } : undefined;
    await cmd('git', args, env, opts?.log);
  }

  /** Checkout an existing branch. */
  static async checkout(directory: string, name: string, opts?: LogPassThrough): Promise<void> {
    const args = ['checkout', name];
    const env = directory ? { cwd: directory } : undefined;
    await cmd('git', args, env, opts?.log);
  }

  /** Return a binary-safe patch between two refs (from..to). Defaults to no logging. */
  static async diffPatch(directory: string, fromRef: string, toRef: string, opts?: LogPassThrough): Promise<string> {
    const args = ['diff', '--binary', `${fromRef}..${toRef}`];
    const env = directory ? { cwd: directory } : undefined;
    const log = opts?.log ?? DEFAULT_SILENT_LOG;
    const { stdout } = await cmd('git', args, env, log);
    return String(stdout ?? '');
  }

  /**
   * Apply a patch to the working tree (stdin piped). Defaults to no logging.
   * When `staged` is true, applies to the index only; otherwise as unstaged changes.
   * When `reverse` is true, applies the patch in reverse.
   */
  static async applyPatch(
    directory: string,
    patch: string,
    opts: { staged?: boolean; reverse?: boolean; log?: LogOptions } = {}
  ): Promise<void> {
    const args = ['apply', '--whitespace=nowarn'];
    if (opts.reverse) {
      args.push('--reverse');
    }
    if (opts.staged) {
      args.push('--cached');
    }
    args.push('-'); // read patch from stdin
    const env = directory ? { cwd: directory } : undefined;
    const baseLog = opts.log ?? DEFAULT_SILENT_LOG;
    await cmd('git', args, env, { ...baseLog, stdin: patch });
  }

  static async hasStagedChanges(directory: string, opts?: LogPassThrough): Promise<boolean> {
    // exit 0 => no staged changes; non-zero => there are staged changes
    try {
      await cmd(
        'git',
        ['diff', '--cached', '--quiet'],
        directory ? { cwd: directory } : {},
        opts?.log ?? DEFAULT_SILENT_LOG
      );
      return false;
    } catch {
      return true;
    }
  }
}

/* ---------- exported function wrappers (unchanged public API) ---------- */

export const cloneAppTemplatePackagesFunctionName = 'cloneAppTemplatePackages';
export const cloneAppTemplatePackagesFunction = {
  definition: {
    name: cloneAppTemplatePackagesFunctionName,
    description: 'Clone the app template packages to the specified directory',
    parameters: {
      type: 'object',
      properties: {
        directory: { type: 'string', description: 'The directory to clone the packages to' },
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
        directory: { type: 'string', description: 'The directory to initialize the git repository in' },
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
        directory: { type: 'string', description: 'The directory of the git repository' },
        remote: { type: 'string', description: 'The remote to set' },
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
        directory: { type: 'string', description: 'The directory of the git repository' },
        remote: { type: 'string', description: 'The remote to add' },
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
        directory: { type: 'string', description: 'The directory of the git repository' },
        message: { type: 'string', description: 'The commit message' },
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
        directory: { type: 'string', description: 'The directory of the git repository' },
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
        directory: { type: 'string', description: 'The directory of the git repository' },
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
        directory: { type: 'string', description: 'The directory of the git repository' },
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
        directory: { type: 'string', description: 'The directory of the git repository' },
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
        directory: { type: 'string', description: 'The directory of the git repository' },
      },
      required: ['directory'],
    },
  },
  call: async (params: { directory: string }) => await GitUtil.sync(params.directory),
};

export const currentBranchFunctionName = 'gitCurrentBranch';
export const currentBranchFunction = {
  definition: {
    name: currentBranchFunctionName,
    description: 'Get the current branch name',
    parameters: {
      type: 'object',
      properties: {
        directory: { type: 'string', description: 'Repository directory' },
      },
      required: ['directory'],
    },
  },
  call: async (params: { directory: string }) => await GitUtil.currentBranch(params.directory),
};

export const headShaFunctionName = 'gitHeadSha';
export const headShaFunction = {
  definition: {
    name: headShaFunctionName,
    description: 'Get the SHA of HEAD',
    parameters: {
      type: 'object',
      properties: {
        directory: { type: 'string', description: 'Repository directory' },
      },
      required: ['directory'],
    },
  },
  call: async (params: { directory: string }) => await GitUtil.headSha(params.directory),
};

export const createBranchFunctionName = 'gitCreateBranch';
export const createBranchFunction = {
  definition: {
    name: createBranchFunctionName,
    description: 'Create and switch to a new branch',
    parameters: {
      type: 'object',
      properties: {
        directory: { type: 'string', description: 'Repository directory' },
        name: { type: 'string', description: 'Branch name' },
      },
      required: ['directory', 'name'],
    },
  },
  call: async (params: { directory: string; name: string }) =>
    await GitUtil.createBranch(params.directory, params.name),
};

export const checkoutFunctionName = 'gitCheckout';
export const checkoutFunction = {
  definition: {
    name: checkoutFunctionName,
    description: 'Checkout an existing branch',
    parameters: {
      type: 'object',
      properties: {
        directory: { type: 'string', description: 'Repository directory' },
        name: { type: 'string', description: 'Branch name' },
      },
      required: ['directory', 'name'],
    },
  },
  call: async (params: { directory: string; name: string }) => await GitUtil.checkout(params.directory, params.name),
};

export const diffPatchFunctionName = 'gitDiffPatch';
export const diffPatchFunction = {
  definition: {
    name: diffPatchFunctionName,
    description: 'Return a binary-safe patch between two refs (from..to)',
    parameters: {
      type: 'object',
      properties: {
        directory: { type: 'string', description: 'Repository directory' },
        from: { type: 'string', description: 'From ref' },
        to: { type: 'string', description: 'To ref' },
      },
      required: ['directory', 'from', 'to'],
    },
  },
  call: async (params: { directory: string; from: string; to: string }) =>
    await GitUtil.diffPatch(params.directory, params.from, params.to),
};

export const applyPatchFunctionName = 'gitApplyPatch';
export const applyPatchFunction = {
  definition: {
    name: applyPatchFunctionName,
    description: 'Apply a patch to the working tree',
    parameters: {
      type: 'object',
      properties: {
        directory: { type: 'string', description: 'Repository directory' },
        patch: { type: 'string', description: 'Patch content' },
        reverse: { type: 'boolean', description: 'Apply in reverse', default: false },
        staged: { type: 'boolean', description: 'Apply to index/staged only', default: false },
      },
      required: ['directory', 'patch'],
    },
  },
  call: async (params: { directory: string; patch: string; reverse?: boolean; staged?: boolean }) =>
    await GitUtil.applyPatch(params.directory, params.patch, {
      reverse: !!params.reverse,
      staged: !!params.staged,
    }),
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
  currentBranchFunction,
  headShaFunction,
  createBranchFunction,
  checkoutFunction,
  diffPatchFunction,
  applyPatchFunction,
];
