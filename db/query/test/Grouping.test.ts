import { QueryBuilder } from '../src/QueryBuilder';

describe('QueryBuilder - GROUP BY Support', () => {
  interface Employee {
    id: number;
    name: string;
    age: number;
    department: string;
    salary: number;
    yearsOfService: number;
  }

  const tableName = 'Employee';

  test('Basic GROUP BY', () => {
    const qb = new QueryBuilder<Employee>(tableName).addGroupBy(['department']);

    // Standard SQL output
    let result = qb.toSql();
    expect(result.sql).toBe('SELECT * FROM Employee GROUP BY department;');

    // SQL output with positional parameters
    result = qb.toSql({ useParams: true });
    expect(result.sql).toBe('SELECT * FROM Employee GROUP BY department;');
    expect(result.params).toEqual([]);

    // SQL output with named parameters and types
    result = qb.toSql({ useParams: true, useNamedParams: true });
    expect(result.sql).toBe('SELECT * FROM Employee GROUP BY department;');
    // GroupBy doesn't use params, so these should be empty
    expect(result.namedParams?.params).toEqual({});
    expect(result.namedParams?.types).toEqual({});
  });

  test('GROUP BY with condition', () => {
    const qb = new QueryBuilder<Employee>(tableName)
      .addCondition({ field: 'age', operator: '>', value: 30 })
      .addGroupBy(['department']);

    // Standard SQL output
    let result = qb.toSql();
    expect(result.sql).toBe("SELECT * FROM Employee WHERE age > 30 GROUP BY department;");

    // SQL output with positional parameters
    result = qb.toSql({ useParams: true });
    expect(result.sql).toContain("SELECT * FROM Employee WHERE age > ? GROUP BY department;");
    expect(result.params).toEqual([30]);

    // SQL output with named parameters and types
    result = qb.toSql({ useParams: true, useNamedParams: true });
    expect(result.sql).toContain("SELECT * FROM Employee WHERE age > @param0 GROUP BY department;");
    expect(result.namedParams?.params).toEqual({ param0: 30 });
    expect(result.namedParams?.types).toEqual({ param0: 'number' });
  });

  test('GROUP BY with aggregate function', () => {
    const qb = new QueryBuilder<Employee>(tableName)
      .addAggregate({ function: 'AVG', field: 'salary' })
      .addGroupBy(['department']);

    // Standard SQL output
    let result = qb.toSql();
    expect(result.sql).toBe('SELECT AVG(salary) FROM Employee GROUP BY department;');

    // SQL output with positional parameters
    result = qb.toSql({ useParams: true });
    expect(result.sql).toBe('SELECT AVG(salary) FROM Employee GROUP BY department;');
    expect(result.params).toEqual([]);

    // SQL output with named parameters and types
    result = qb.toSql({ useParams: true, useNamedParams: true });
    expect(result.sql).toBe('SELECT AVG(salary) FROM Employee GROUP BY department;');
    // Aggregate functions and GroupBy don't use params, so these should be empty
    expect(result.namedParams?.params).toEqual({});
    expect(result.namedParams?.types).toEqual({});
  });

  test('Multiple GROUP BY fields', () => {
    const qb = new QueryBuilder<Employee>(tableName).addGroupBy(['department', 'age']);

    // Standard SQL output
    let result = qb.toSql();
    expect(result.sql).toBe('SELECT * FROM Employee GROUP BY department, age;');

    // SQL output with positional parameters
    result = qb.toSql({ useParams: true });
    expect(result.sql).toBe('SELECT * FROM Employee GROUP BY department, age;');
    expect(result.params).toEqual([]);

    // SQL output with named parameters and types
    result = qb.toSql({ useParams: true, useNamedParams: true });
    expect(result.sql).toBe('SELECT * FROM Employee GROUP BY department, age;');
    expect(result.namedParams?.params).toEqual({});
    expect(result.namedParams?.types).toEqual({});
  });

  test('GROUP BY with multiple aggregate functions', () => {
    const qb = new QueryBuilder<Employee>(tableName)
      .addAggregate({ function: 'MAX', field: 'salary' })
      .addAggregate({ function: 'MIN', field: 'age' })
      .addGroupBy(['department']);

    // Standard SQL output
    let result = qb.toSql();
    expect(result.sql).toBe('SELECT MAX(salary), MIN(age) FROM Employee GROUP BY department;');

    // SQL output with positional parameters
    result = qb.toSql({ useParams: true });
    expect(result.sql).toBe('SELECT MAX(salary), MIN(age) FROM Employee GROUP BY department;');
    expect(result.params).toEqual([]);

    // SQL output with named parameters and types
    result = qb.toSql({ useParams: true, useNamedParams: true });
    expect(result.sql).toBe('SELECT MAX(salary), MIN(age) FROM Employee GROUP BY department;');
    expect(result.namedParams?.params).toEqual({});
    expect(result.namedParams?.types).toEqual({});
  });

  test('GROUP BY with aggregate function and condition', () => {
    const qb = new QueryBuilder<Employee>(tableName)
      .addCondition({ field: 'department', operator: '=', value: 'Engineering' })
      .addAggregate({ function: 'COUNT', field: 'id' })
      .addGroupBy(['age']);

    // Standard SQL output
    let result = qb.toSql();
    expect(result.sql).toBe("SELECT COUNT(id) FROM Employee WHERE department = 'Engineering' GROUP BY age;");

    // SQL output with positional parameters
    result = qb.toSql({ useParams: true });
    expect(result.sql).toContain("SELECT COUNT(id) FROM Employee WHERE department = ? GROUP BY age;");
    expect(result.params).toEqual(['Engineering']);

    // SQL output with named parameters and types
    result = qb.toSql({ useParams: true, useNamedParams: true });
    expect(result.sql).toContain("SELECT COUNT(id) FROM Employee WHERE department = @param0 GROUP BY age;");
    expect(result.namedParams?.params).toEqual({ param0: 'Engineering' });
    expect(result.namedParams?.types).toEqual({ param0: 'string' });
  });

  test('GROUP BY with multiple fields', () => {
    const qb = new QueryBuilder<Employee>(tableName)
      .addAggregate({ function: 'AVG', field: 'salary' })
      .addGroupBy(['department', 'age']);

    // Standard SQL output
    let result = qb.toSql();
    expect(result.sql).toBe('SELECT AVG(salary) FROM Employee GROUP BY department, age;');

    // SQL output with positional parameters
    result = qb.toSql({ useParams: true });
    expect(result.sql).toBe('SELECT AVG(salary) FROM Employee GROUP BY department, age;');
    expect(result.params).toEqual([]);

    // SQL output with named parameters and types
    result = qb.toSql({ useParams: true, useNamedParams: true });
    expect(result.sql).toBe('SELECT AVG(salary) FROM Employee GROUP BY department, age;');
    expect(result.namedParams?.params).toEqual({});
    expect(result.namedParams?.types).toEqual({});
  });

  test('GROUP BY with logical group condition', () => {
    const qb = new QueryBuilder<Employee>(tableName)
      .addLogicalGroup('AND', [
        { field: 'age', operator: '>', value: 30 },
        { field: 'yearsOfService', operator: '<', value: 10 }
      ])
      .addAggregate({ function: 'SUM', field: 'salary' })
      .addGroupBy(['department']);
  
    // Standard SQL output
    let result = qb.toSql();
    expect(result.sql).toBe("SELECT SUM(salary) FROM Employee WHERE (age > 30 AND yearsOfService < 10) GROUP BY department;");
  
    // SQL output with positional parameters
    result = qb.toSql({ useParams: true });
    expect(result.sql).toContain("SELECT SUM(salary) FROM Employee WHERE (age > ? AND yearsOfService < ?) GROUP BY department;");
    expect(result.params).toEqual([30, 10]);
  
    // SQL output with named parameters and types
    result = qb.toSql({ useParams: true, useNamedParams: true });
    expect(result.sql).toContain("SELECT SUM(salary) FROM Employee WHERE (age > @param0 AND yearsOfService < @param1) GROUP BY department;");
    expect(result.namedParams?.params).toEqual({ param0: 30, param1: 10 });
    expect(result.namedParams?.types).toEqual({ param0: 'number', param1: 'number' });
  });
  
  test('Complex GROUP BY with multiple conditions and aggregates', () => {
    const qb = new QueryBuilder<Employee>(tableName)
      .addCondition({ field: 'department', operator: '=', value: 'Engineering' })
      .addLogicalGroup('OR', [
        { field: 'age', operator: '>', value: 50 },
        { field: 'yearsOfService', operator: '>=', value: 20 }
      ])
      .addAggregate({ function: 'COUNT', field: 'id' })
      .addAggregate({ function: 'AVG', field: 'salary' })
      .addGroupBy(['department', 'age']);
  
    // Standard SQL output
    let result = qb.toSql();
    expect(result.sql).toBe("SELECT COUNT(id), AVG(salary) FROM Employee WHERE department = 'Engineering' AND (age > 50 OR yearsOfService >= 20) GROUP BY department, age;");
  
    // SQL output with positional parameters
    result = qb.toSql({ useParams: true });
    expect(result.sql).toContain("SELECT COUNT(id), AVG(salary) FROM Employee WHERE department = ? AND (age > ? OR yearsOfService >= ?) GROUP BY department, age;");
    expect(result.params).toEqual(['Engineering', 50, 20]);
  
    // SQL output with named parameters and types
    result = qb.toSql({ useParams: true, useNamedParams: true });
    expect(result.sql).toContain("SELECT COUNT(id), AVG(salary) FROM Employee WHERE department = @param0 AND (age > @param1 OR yearsOfService >= @param2) GROUP BY department, age;");
    expect(result.namedParams?.params).toEqual({ param0: 'Engineering', param1: 50, param2: 20 });
    expect(result.namedParams?.types).toEqual({ param0: 'string', param1: 'number', param2: 'number' });
  });
  
});