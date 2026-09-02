import { parseArgsMap } from '../src/ArgsMap';

describe('parseArgsMap', () => {
  test('preserves the full value when it contains embedded = characters', () => {
    // The estate CLI's --note values regularly carry '=' (e.g. env assignments, key=value notes).
    // The parser must split on the FIRST '=' only and keep the remainder intact.
    const args = parseArgsMap(['--note=emulator=spanner-x port=9040']);
    expect(args['note']).toEqual('emulator=spanner-x port=9040');
  });

  test('parses a simple key=value pair', () => {
    const args = parseArgsMap(['--name=my-estate']);
    expect(args['name']).toEqual('my-estate');
  });

  test('parses a bare flag as boolean true', () => {
    const args = parseArgsMap(['--pin']);
    expect(args['pin']).toEqual(true);
  });

  test('parses an explicitly empty value as the empty string', () => {
    const args = parseArgsMap(['--note=']);
    expect(args['note']).toEqual('');
  });

  test('ignores args that do not start with --', () => {
    const args = parseArgsMap(['positional', '-x', '--keep=yes']);
    expect(args).toEqual({ keep: 'yes' });
  });

  test('parses multiple args together, preserving each full value', () => {
    const args = parseArgsMap(['--containers=spanner-x', '--pids=123', '--pin', '--note=a=b=c']);
    expect(args).toEqual({ containers: 'spanner-x', pids: '123', pin: true, note: 'a=b=c' });
  });
});
