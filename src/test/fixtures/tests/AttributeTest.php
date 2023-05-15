<?php

namespace Chiefmyron\TestWorkbench;

use Chiefmyron\TestWorkbench\DataProviders\ExternalDataProvider;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\DataProviderExternal;
use PHPUnit\Framework\Attributes\Depends;
use PHPUnit\Framework\Attributes\Group;
use PHPUnit\Framework\Attributes\Small;
use PHPUnit\Framework\Attributes\Medium;
use PHPUnit\Framework\Attributes\Large;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\Attributes\Ticket;
use PHPUnit\Framework\TestCase;

class AttributeTest extends TestCase
{
    #[Test]
    public function hi(): void
    {
        self::assertTrue(true);
    }

    #[TestDox('Renamed test')]
    public function testRename(): void
    {
        self::assertTrue(true);
    }

    #[DataProvider('additionProvider')]
    public function testAddOneDataProvider(int $a, int $b, int $expected): void
    {
        $this->assertSame($expected, $a + $b);
    }

    #[DataProvider('additionProvider')]
    #[DataProvider('additionProvider2')]
    public function testAddTwoDataProviders(int $a, int $b, int $expected): void
    {
        $this->assertSame($expected, $a + $b);
    }

    #[DataProviderExternal(ExternalDataProvider::class, 'additionProvider')]
    public function testAddExternalDataProviders(int $a, int $b, int $expected): void
    {
        $this->assertSame($expected, $a + $b);
    }

    public static function additionProvider(): array
    {
        return [
            [0, 0, 0],
            [0, 1, 1],
            [1, 0, 1],
            [1, 1, 2],
        ];
    }

    public static function additionProvider2(): array
    {
        return [
            [1, 0, 1],
            [2, 1, 3],
            [3, 0, 3],
            [4, 1, 5],
        ];
    }

    public function testEmpty(): array
    {
        $stack = [];
        $this->assertEmpty($stack);

        return $stack;
    }

    #[Depends('testEmpty')]
    public function testPush(array $stack): array
    {
        array_push($stack, 'foo');
        $this->assertSame('foo', $stack[count($stack) - 1]);
        $this->assertNotEmpty($stack);

        return $stack;
    }

    #[Group('chiefmyron')]
    public function testGroupAttribute(): void {
        $this->assertTrue(true);
    }

    #[Small]
    public function testSmallAttribute(): void {
        $this->assertTrue(true);
    }

    //#[Medium]
    public function testMediumAttribute(): void {
        $this->assertTrue(true);
    }

    //#[Large]
    public function testLargeAttribute(): void {
        $this->assertTrue(true);
    }

    #[Ticket('chiefmyron2')]
    public function testTicketAttribute(): void {
        $this->assertTrue(true);
    }
}
