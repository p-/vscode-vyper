import * as assert from 'assert';
import { vyperErrorLineToCheckResult, pythonErrorLineToCheckResult, syntaxErrorToCheckResult, exceptionErrorLineToCheckResult } from '../util';

suite("Vyper Error Output Parsing Tests", () => {

    test("Vyper Error with line number", () => {
        const res = vyperErrorLineToCheckResult('vyper.exceptions.InvalidTypeException: line 10: Invalid base type: int18', 'test.vy', 'error');

        assert.equal(res.line, 10);
        assert.equal(res.msg, 'Invalid base type: int18');
        assert.equal(res.file, 'test.vy');
        assert.equal(res.severity, 'error');
    });

    test("Vyper Error without line number", () => {
        const res = vyperErrorLineToCheckResult('vyper.exceptions.TypeMismatchException: Typecasting from base type decimal to int128 unavailable', 'test.vy', 'error');

        assert.equal(res.line, 1);
        assert.equal(res.msg, 'Typecasting from base type decimal to int128 unavailable');
    });


    test("Python Error with line number", () => {
        const res = pythonErrorLineToCheckResult('tokenize.TokenError: (\'EOF in multi-line statement\', (49, 0))', 'test.vy', 'error');

        assert.equal(res.line, 49);
        assert.equal(res.msg, 'EOF in multi-line statement');
        assert.equal(res.file, 'test.vy');
        assert.equal(res.severity, 'error');
    });


    test("Syntax Error with line number", () => {
        const errorLines = [' File "<unknown>", line 24', '    def participate:', '                   ^', 'SyntaxError: invalid syntax']; 
        const res = syntaxErrorToCheckResult(errorLines, 3, 'test.vy', 'error');

        assert.equal(res.line, 24);
        assert.equal(res.msg, 'SyntaxError: invalid syntax');
        assert.equal(res.file, 'test.vy');
        assert.equal(res.severity, 'error');
    });

    test("Exception Error without line number", () => {
        const res = exceptionErrorLineToCheckResult('Exception: Unsupported keyword: block.timetamp', 'test.vy', 'error');

        assert.equal(res.line, 1);
        assert.equal(res.msg, 'Unsupported keyword: block.timetamp');
        assert.equal(res.file, 'test.vy');
        assert.equal(res.severity, 'error');
    });

});