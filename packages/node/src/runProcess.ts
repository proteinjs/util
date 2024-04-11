import * as child_process from 'child_process';

export async function runProcess(program: string, args: string[] = [], options: child_process.SpawnOptions = {}): Promise<void> {
	return new Promise<void>(function (resolve, reject) {
		const command = `\`${program} ${args.join(' ')}\``;
		console.info(`Executing: ${command}`);
		const childProcess = child_process.spawn(program, args, options);
		if (childProcess === null || childProcess.stdout === null || childProcess.stderr === null) {
			reject('Failed to spawn child process');
			return;
		}

		childProcess.stdout.on('data', (data) => {
			pipe(data);
		});
		let failedExecution = false;
		try {
			childProcess.stderr.on('data', (data) => {
				pipe(data);
			});
		} catch (error) {
			failedExecution = true;
		}

		childProcess.on('exit', function (code) {
			const exitedSuccessfully = code == 0;
			if (exitedSuccessfully)
				console.info(`[${command}] process exited successfully`);
			else
				console.error(`[${command}] process exited with error`, null);

			if (exitedSuccessfully && !failedExecution)
				resolve();
			else
				reject(`Failed while executing: ${command}`);
		});
	});

	function pipe(data: string) {
		let message = data.toString();
		if (!message)
			return;

		console.log(message);
	}
}