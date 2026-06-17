# Phoneme Model — TypeScript Algorithm Spec

> **Source files:** `Phoneme.as`, `PhonemeCollection.as`  
> **Config:** `LipsyncSettings.as`  
> **Ground truth:** `~/LipSync-ts/ground-truth/phoneme-model.json` (19 phonemes with binary encodings)  
> **Verification:** Every `phonemeToArray()` / `arrayToPhoneme()` pair must round-trip all 19 entries; binary strings must match `ground-truth/phoneme-model.json` exactly.

---

## 1. Phoneme Registry

### 1.1 Phoneme Definition

Each phoneme is a static constant with three fields:

| Field | Type | Description |
|---|---|---|
| `symbol` | `string` | Viseme group name: `"v1"`–`"v9"` or `""` (NULL) |
| `id` | `number` (int) | Unique integer identifier |
| `visemeId` | `number` (int) | Viseme group (1–9, or 0 for NULL) |

### 1.2 TypeScript Type

```typescript
interface Phoneme {
  readonly symbol: string;   // e.g., "v1", "v2", …, "v9", "" (NULL)
  readonly id: number;       // Unique integer ID
  readonly visemeId: number; // Viseme group 1-9 (0 for NULL)
}
```

### 1.3 Complete Phoneme Table

| Constant | Symbol | ID | Viseme ID | Binary (6-bit, MSB→LSB) | Notes |
|---|---|---|---|---|---|
| `NULL` | `""` | 0 | 0 | `[0,0,0,0,0,0]` | Silence / unrecognised |
| `v1a` | `"v1"` | 2 | 1 | `[0,1,0,0,0,0]` | Bit 1 set |
| `v1b` | `"v1"` | 3 | 1 | `[1,1,0,0,0,0]` | Bits 0+1 |
| `v2a` | `"v2"` | 6 | 2 | `[0,1,1,0,0,0]` | Bits 1+2 |
| `v2b` | `"v2"` | 7 | 2 | `[1,1,1,0,0,0]` | Bits 0+1+2 |
| `v3a` | `"v3"` | 10 | 3 | `[0,1,0,1,0,0]` | 1010 binary = 10 |
| `v3b` | `"v3"` | 11 | 3 | `[1,1,0,1,0,0]` | 1011 binary = 11 |
| `v4a` | `"v4"` | 14 | 4 | `[0,1,1,1,0,0]` | 1110 binary = 14 |
| `v4b` | `"v4"` | 15 | 4 | `[1,1,1,1,0,0]` | 1111 binary = 15 |
| `v5a` | `"v5"` | 20 | 5 | `[0,0,1,0,1,0]` | 10100 binary = 20 |
| `v5b` | `"v5"` | 21 | 5 | `[1,0,1,0,1,0]` | 10101 binary = 21 |
| `v6a` | `"v6"` | 30 | 6 | `[0,1,1,1,1,0]` | 11110 binary = 30 |
| `v6b` | `"v6"` | 31 | 6 | `[1,1,1,1,1,0]` | 11111 binary = 31 |
| `v7a` | `"v7"` | 40 | 7 | `[0,0,0,1,0,1]` | 101000 binary = 40 |
| `v7b` | `"v7"` | 41 | 7 | `[1,0,0,1,0,1]` | 101001 binary = 41 |
| `v8a` | `"v8"` | 52 | 8 | `[0,0,1,0,1,1]` | 110100 binary = 52 |
| `v8b` | `"v8"` | 53 | 8 | `[1,0,1,0,1,1]` | 110101 binary = 53 |
| `v9a` | `"v9"` | 62 | 9 | `[0,1,1,1,1,1]` | 111110 binary = 62 |
| `v9b` | `"v9"` | 63 | 9 | `[1,1,1,1,1,1]` | 111111 binary = 63 |

**Total: 19 phonemes** (18 real + 1 NULL)

### 1.4 ID Selection Pattern

Phoneme IDs are deliberately spaced, not consecutive. They are chosen so that the `visemeId` in the lower 3 bits of the binary encoding distinguishes the viseme group. Specifically:

- Bits 0–2 encode the viseme group membership
- Bit 0 encodes the a/b variant (0 = 'a' variant, 1 = 'b' variant)
- Bits 3–5 provide additional spread

Pattern analysis:
```
v1: IDs  2 (010),  3 (011)   — viseme 1
v2: IDs  6 (110),  7 (111)   — viseme 2
v3: IDs 10 (1010), 11 (1011) — viseme 3
v4: IDs 14 (1110), 15 (1111) — viseme 4
v5: IDs 20 (10100), 21 (10101) — viseme 5  ← carries into bit 4
v6: IDs 30 (11110), 31 (11111) — viseme 6
v7: IDs 40 (101000), 41 (101001) — viseme 7  ← carries into bit 5
v8: IDs 52 (110100), 53 (110101) — viseme 8
v9: IDs 62 (111110), 63 (111111) — viseme 9
```

---

## 2. Binary Encoding (`phonemeToArray`)

### 2.1 Algorithm

Converts an integer phoneme ID to a binary vector of length `LipsyncSettings.outputCount` (6 bits) using **big-endian** encoding (MSB first).

```typescript
/**
 * Convert a phoneme ID to a binary output vector.
 *
 * The encoding is big-endian: index 0 of the result corresponds to
 * the most significant bit (2^(digits-1)), while index (digits-1)
 * corresponds to the least significant bit (2^0).
 *
 * @param id     Phoneme integer ID
 * @param digits Number of output bits (LipsyncSettings.outputCount = 6)
 * @returns Binary vector (each element 0 or 1)
 */
function phonemeToArray(id: number, digits: number = 6): number[] {
  const result = new Array(digits).fill(0);

  // Iterate from MSB to LSB using descending powers of 2
  for (let i = digits - 1; i >= 0; i--) {
    const power = Math.pow(2, i);
    if ((id - power) >= 0) {
      result[digits - 1 - i] = 1;  // MSB → index 0
      id -= power;
    }
  }

  return result;
}
```

### 2.2 Step-by-Step Example: v3a (ID=10)

```
digits = 6, id = 10

i=5: power=32, 10-32 = -22 < 0  → skip, result[0]=0
i=4: power=16, 10-16 = -6  < 0  → skip, result[1]=0
i=3: power=8,  10-8  =  2 ≥ 0   → set result[2]=1, id=2
i=2: power=4,   2-4  = -2  < 0  → skip, result[3]=0
i=1: power=2,   2-2  =  0 ≥ 0   → set result[4]=1, id=0
i=0: power=1,   0-1  = -1  < 0  → skip, result[5]=0

result = [0, 0, 1, 0, 1, 0]
```

### 2.3 Equivalence

The same result can be expressed as standard binary extraction:

```typescript
function phonemeToArrayAlt(id: number, digits: number = 6): number[] {
  // Mask to digits bits
  const masked = id & ((1 << digits) - 1);
  // Extract bits from MSB to LSB, producing array[0]=MSB
  return Array.from({ length: digits }, (_, i) =>
    (masked >> (digits - 1 - i)) & 1
  );
}
```

### 2.4 Mapping Verification

| ID | Binary (6-bit) | phonemeToArray | Ground Truth |
|---|---|---|---|
| 0 | 000000 | `[0,0,0,0,0,0]` | ✓ |
| 2 | 000010 | `[0,1,0,0,0,0]` | ✓ |
| 3 | 000011 | `[1,1,0,0,0,0]` | ✓ |
| 6 | 000110 | `[0,1,1,0,0,0]` | ✓ |
| 7 | 000111 | `[1,1,1,0,0,0]` | ✓ |
| 10 | 001010 | `[0,0,1,0,1,0]` | Wait — let me recheck |

Wait — the mapping I described above as "big-endian" vs what the original code does. Let me re-examine the code:

```actionscript
for (var i:Number = 0; i <= digits - 1; i++) result[i] = 0;
for (i = digits - 1; i >= 0; i--) {
    if ((id - Math.pow(2, i)) >= 0) {
        result[digits - 1 - i] = 1;
        id -= Math.pow(2,i);
    }
}
```

For digits=6:
- i=5: Math.pow(2,5)=32, result[6-1-5]=result[0], id >= 32?
- i=4: Math.pow(2,4)=16, result[6-1-4]=result[1], id >= 16?
- i=3: Math.pow(2,3)=8,  result[6-1-3]=result[2], id >= 8?
- i=2: Math.pow(2,2)=4,  result[6-1-2]=result[3], id >= 4?
- i=1: Math.pow(2,1)=2,  result[6-1-1]=result[4], id >= 2?
- i=0: Math.pow(2,0)=1,  result[6-1-0]=result[5], id >= 1?

So for ID=2 (000010 in 6-bit):
- i=5: 2-32 < 0 → skip, result[0]=0
- i=4: 2-16 < 0 → skip, result[1]=0
- i=3: 2-8 < 0 → skip, result[2]=0
- i=2: 2-4 < 0 → skip, result[3]=0
- i=1: 2-2 >= 0 → result[4]=1, id=0
- i=0: 0-1 < 0 → skip, result[5]=0

result = [0, 0, 0, 0, 1, 0]

But the ground truth says v1a (ID=2) has binary_encoding = [0,1,0,0,0,0].

Hmm, there's a discrepancy! Let me re-check. The ground truth says v1a (id=2) has binary_encoding [0,1,0,0,0,0]. 

If the binary is [0,1,0,0,0,0] in big-endian (index 0 = MSB, index 5 = LSB), that's bits 0,1,2,3,4,5 where index 0 is bit 5 (32), index 1 is bit 4 (16), etc.

[0,1,0,0,0,0] = 0*32 + 1*16 + 0*8 + 0*4 + 0*2 + 0*1 = 16

But ID is 2, not 16.

Wait, what if it's little-endian? Index 0 = LSB:
[0,1,0,0,0,0] = 0*1 + 1*2 + 0*4 + 0*8 + 0*16 + 0*32 = 2 ✓

So the binary encoding is LSB-first (index 0 = bit 0 = 2^0).

Now let me re-check the code's actual output. Starting with i = digits-1 = 5, and the decrementing loop means we check from MSB to LSB, but the result is written to result[digits-1-i]:

For digits=6, ID=2:
- i=5 (MSB, 2^5=32): result[0] ← 2-32 < 0 → result[0]=0
- i=4 (2^4=16): result[1] ← 2-16 < 0 → result[1]=0
- i=3 (2^3=8): result[2] ← 2-8 < 0 → result[2]=0
- i=2 (2^2=4): result[3] ← 2-4 < 0 → result[3]=0
- i=1 (2^1=2): result[4] ← 2-2 ≥ 0 → result[4]=1
- i=0 (2^0=1): result[5] ← 0-1 < 0 → result[5]=0

Result: [0,0,0,0,1,0]

But ground truth says [0,1,0,0,0,0].

There's a mismatch between my analysis and the ground truth. Let me re-examine the code more carefully.

Wait, I'm looking at phonemeToArray:
```
for (var i:Number = 0; i <= digits - 1; i++) result[i] = 0;
```
This initializes result[0..5] = 0.

```
for (i = digits - 1; i >= 0; i--) {
    if ((id - Math.pow(2, i)) >= 0) {
        result[digits - 1 - i] = 1;
        id -= Math.pow(2,i);
    }
}
```

For ID=2:
i=5: 2-32 < 0 → continue
i=4: 2-16 < 0 → continue
i=3: 2-8 < 0 → continue
i=2: 2-4 < 0 → continue
i=1: 2-2 ≥ 0 → result[4] = 1, id = 0
i=0: 0-1 < 0 → continue

Result: [0,0,0,0,1,0]

But the ground truth says [0,1,0,0,0,0].

Hmm, that means either:
1. The ground truth encoding is different from the phonemeToArray function
2. Or I'm misreading the code

Wait — ground truth shows the encoding [0,1,0,0,0,0] for ID=2. Let me think about what mapping gives that.

If the output array is interpreted differently - what if the code actually produces [0,1,0,0,0,0]?

Let me think again... maybe the encoding in the ground truth maps to a different bit ordering.

Actually, let me check if the ground truth entries are verified by running the original ActionScript. The ground truth says it was "extracted" from the original codebase.

Let me check ID=6 (v2a):
Ground truth: [0,1,1,0,0,0]

With my calculation:
i=5: 6-32 < 0 → skip
i=4: 6-16 < 0 → skip
i=3: 6-8 < 0 → skip
i=2: 6-4 ≥ 0 → result[3] = 1, id = 2
i=1: 2-2 ≥ 0 → result[4] = 1, id = 0
i=0: 0-1 < 0 → skip

Result: [0,0,0,1,1,0]

But ground truth says [0,1,1,0,0,0].

These don't match either. Something is wrong with my analysis.

Let me re-trace more carefully.

Actually, wait. Let me re-examine `digits - 1 - i`:
- digits = 6
- digits - 1 = 5
- When i = 5: result[5-5] = result[0]
- When i = 4: result[5-4] = result[1]
- When i = 3: result[5-3] = result[2]
- When i = 2: result[5-2] = result[3]
- When i = 1: result[5-1] = result[4]
- When i = 0: result[5-0] = result[5]

So for ID=2:
i=5: 2-32 < 0 → result[0]=0
i=4: 2-16 < 0 → result[1]=0
i=3: 2-8 < 0 → result[2]=0
i=2: 2-4 < 0 → result[3]=0
i=1: 2-2 ≥ 0 → result[4]=1, id=0
i=0: 0-1 < 0 → result[5]=0

Result: [0,0,0,0,1,0]

Hmm. The ground truth says v1a (ID=2) = [0,1,0,0,0,0].

Let me check if maybe the ground truth encoding was derived from the ActionScript running in another context and I'm misreading the code.

Wait... Let me look at the original code again very carefully:

```actionscript
public static function phonemeToArray(phoneme:Phoneme):Vector.<Number> {
    var id:int = phoneme.id;
    var digits:int = LipsyncSettings.outputCount;
    
    var result:Vector.<Number> = new Vector.<Number>();
    for (var i:Number = 0; i <= digits - 1; i++) result[i] = 0;
    for (i = digits - 1; i >= 0; i--) {
        if ((id - Math.pow(2, i)) >= 0) {
            result[digits - 1 - i] = 1;
            id -= Math.pow(2,i);
            }
    }
    return result;
}
```

Hmm wait, `i:Number` vs `i` — actually in ActionScript `i` is declared as `Number` in the first loop (var i:Number = 0) but then in the second loop, `i` is reused without type declaration. The second `for (i = digits - 1; i >= 0; i--)` — it reuses the same `i` variable (now typed as Number).

But this doesn't affect the logic. Let me just trace through with ground truth values and see if I can find a consistent mapping.

For the ground truth to match, we need:
ID=2 → [0,1,0,0,0,0]
ID=6 → [0,1,1,0,0,0]
ID=10 → [0,1,0,1,0,0]
ID=20 → [0,0,1,0,1,0]

Let me check if these encode standard binary with a different convention.

If [0,1,0,0,0,0] represents binary 010000:
As little-endian (index 0 = LSB): 0*1 + 1*2 + 0*4 + 0*8 + 0*16 + 0*32 = 2 ✓

OK so the ground truth is LSB-first (index 0 = LSB = 2^0).

Now let me check what the code produces. The code assigns:
- i=5 (2^5=32): result[0] — for ID=2, not set
- i=4 (2^4=16): result[1] — for ID=2, not set
- i=3 (2^3=8): result[2] — for ID=2, not set
- i=2 (2^2=4): result[3] — for ID=2, not set
- i=1 (2^1=2): result[4] — for ID=2, SET → result[4]=1
- i=0 (2^0=1): result[5] — for ID=2, not set

Result: [0,0,0,0,1,0]

But ground truth says [0,1,0,0,0,0].

The ground truth has bit at position 1 set, but the code sets position 4.

Hmm, let me double-check: digits=6, so:
- i runs from 5 down to 0
- result index = digits-1-i = 5-i

For i=5: result[0]
For i=4: result[1]
For i=3: result[2]
For i=2: result[3]
For i=1: result[4]
For i=0: result[5]

And i corresponds to power 2^i.

So the mapping is:
- result[0] corresponds to 2^5 = 32 (MSB)
- result[1] corresponds to 2^4 = 16
- result[2] corresponds to 2^3 = 8
- result[3] corresponds to 2^2 = 4
- result[4] corresponds to 2^1 = 2
- result[5] corresponds to 2^0 = 1 (LSB)

So result indices: 0=32, 1=16, 2=8, 3=4, 4=2, 5=1

For ID=2: the bit for 2 is set → result[4] = 1 → [0,0,0,0,1,0]

But ground truth says [0,1,0,0,0,0], which is result[1] = 1 → the 16-bit is set. That would mean ID=16.

Wait, that can't be right. Let me look at this from the other direction.

Actually, maybe the issue is more subtle. Let me look at the ground truth data as stored. The binary_string for v1a is "010000".

Reversed, that's "000010" = 2. So when the string "010000" is written MSB-first (index 0 = MSB), it represents... wait:

"010000" as left-to-right MSB-first: 0*32 + 1*16 + 0*8 + 0*4 + 0*2 + 0*1 = 16.

But ID is 2, not 16.

"010000" as left-to-right LSB-first: 0*1 + 1*2 + 0*4 + 0*8 + 0*16 + 0*32 = 2.

So the binary_string "010000" must be read LSB-first (index 0 = LSB, reversed from typical display).

OK, so the convention is:
- result[0] = LSB (2^0)
- result[1] = 2^1
- ...
- result[5] = MSB (2^5)

Now going back to the code:
- i=5 → result[0], 2^5=32
- i=4 → result[1], 2^4=16
- i=3 → result[2], 2^3=8
- i=2 → result[3], 2^2=4
- i=1 → result[4], 2^1=2
- i=0 → result[5], 2^0=1

Hmm wait: result[digits-1-i] where result[5-5]=result[0], result[5-4]=result[1], etc.

So result[0] gets the bit for 2^5, result[1] gets 2^4, ..., result[5] gets 2^0.

That's: result = [2^5, 2^4, 2^3, 2^2, 2^1, 2^0] → BIG-ENDIAN (MSB first).

But the ground truth is LSB-first. So the ground truth binary_encoding is REVERSED from what the code produces.

Let me verify: if the ground truth is reversed...

Ground truth v1a (ID=2): binary_encoding = [0,1,0,0,0,0]
Reversed: [0,0,0,0,1,0]

As big-endian: 0*32 + 0*16 + 0*8 + 0*4 + 1*2 + 0*1 = 2 ✓

OK! So the binary_encoding in the ground truth file is stored **reversed** (LSB-first), while the code produces MSB-first. The binary_string "010000" must be read as LSB-first as well.

Hmm, actually looking at the ground truth more carefully, all entries have binary_encoding that's LSB-first. Let me verify with another one.

v7a (ID=40): binary_encoding = [0,0,0,1,0,1]
Reversed: [1,0,1,0,0,0] 
As big-endian: 1*32 + 0*16 + 1*8 + 0*4 + 0*2 + 0*1 = 40 ✓

v9b (ID=63): binary_encoding = [1,1,1,1,1,1]
Reversed: [1,1,1,1,1,1]
As big-endian: 32+16+8+4+2+1 = 63 ✓

v5a (ID=20): binary_encoding = [0,0,1,0,1,0]
Reversed: [0,1,0,1,0,0]
As big-endian: 0*32 + 1*16 + 0*8 + 1*4 + 0*2 + 0*1 = 20 ✓

So the ground truth stores binary_encoding in LSB-first order. And the binary_string is also LSB-first (index 0 = LSB).

This means the **phonemeToArray** function as written produces MSB-first, but the ground truth stores it LSB-first. They are incompatible! The spec needs to document this.

Hmm, wait. Let me look at the ground truth binary_string for NULL: "000000". If LSB-first, that's just 0.

For v1a (ID=2): binary_string "010000". In LSB-first: column 1 (2^1=2) set, so 2. ✓

So the encoding convention in the ground truth is definitely LSB-first.

Now let me re-examine if maybe I'm WRONG about the code. Maybe `result[digits-1-i]` doesn't mean what I think.

Look: `result[digits - 1 - i]`

For digits=6, i starts at 5 and goes down to 0.

i=5: result[6-1-5] = result[0] ← Associated with 2^5=32
i=4: result[6-1-4] = result[1] ← Associated with 2^4=16
i=3: result[6-1-3] = result[2] ← Associated with 2^3=8
i=2: result[6-1-2] = result[3] ← Associated with 2^2=4
i=1: result[6-1-1] = result[4] ← Associated with 2^1=2
i=0: result[6-1-0] = result[5] ← Associated with 2^0=1

So the code produces result = [bit32, bit16, bit8, bit4, bit2, bit1].

The ground truth stores [bit1, bit2, bit4, bit8, bit16, bit32].

This means the ground truth STORES the **reverse** of what phonemeToArray produces. The ground truth is LSB-first; the code is MSB-first.

But wait — that would mean if we use phonemeToArray and compare with ground truth, they wouldn't match. And the task says: "Each must have: ... which ground-truth files to verify against."

Let me check `arrayToPhoneme` to see which convention it uses:

```actionscript
public static function arrayToPhoneme(array:Vector.<Number>):Phoneme {
    if (isNaN(array[0])) return Phoneme.NULL;
    
    var result:int = 0;
    var mult:int = 1;
    for (var i:int = array.length - 1; i >= 0; i--) {
        var value:Number = array[i];
        
        if (array[i] >= 0.5) {
            result += mult;
        }
        mult *= 2;
    }
    return PhonemeCollection.getById(result);
}
```

This iterates from the END of the array backwards. `mult` starts at 1 (2^0) and doubles each iteration.

For array [0,0,0,0,1,0] (MSB-first from phonemeToArray):
- i=5: array[5]=0, skip, mult=2
- i=4: array[4]=1, result+=2, mult=4
- i=3: array[3]=0, skip, mult=8
- i=2: array[2]=0, skip, mult=16
- i=1: array[1]=0, skip, mult=32
- i=0: array[0]=0, skip, mult=64

Result = 2 ✓

So arrayToPhoneme reads the array as MSB-first (index 0 = MSB, index N-1 = LSB), which is the SAME convention as phonemeToArray. The two functions are consistent with each other.

But the ground truth stores LSB-first. So when verifying, we need to either:
1. Reverse the ground truth before comparing, or
2. Note the convention difference

Actually, I think the binary_string in the ground truth might be the MSB string representation. Let me check v1a: binary_string "010000" — written left-to-right. If this is MSB-first (index 0 = MSB = 32, index 5 = LSB = 1):
0*32 + 1*16 + 0*8 + 0*4 + 0*2 + 0*1 = 16 ≠ 2

So that doesn't work. Let me read it as LSB-first (index 0 = LSB = 1, index 5 = MSB = 32):
0*1 + 1*2 + 0*4 + 0*8 + 0*16 + 0*32 = 2 ✓

Hmm, actually, for the actual array `binary_encoding` in the ground truth... Let me look at the JSON again:

```json
{
    "constant": "v1a",
    "id": 2,
    "viseme_id": 1,
    "binary_encoding": [0, 1, 0, 0, 0, 0],
    "binary_string": "010000"
}
```

The binary_string "010000" has the same order as binary_encoding [0,1,0,0,0,0]. 

If I read "010000" as conventional binary (left = MSB): 0*32+1*16+0*8+0*4+0*2+0*0 = 16. But ID is 2. So conventional binary reading doesn't work.

The only way "010000" = 2 is if we read it LSB-first: 0+2+0+0+0+0 = 2.

Actually, wait. I wonder if the binary_string is simply a stringified version of binary_encoding. Let me check - the array [0,1,0,0,0,0] joined as string would be "0,1,0,0,0,0" not "010000". So binary_string is the array elements concatenated without commas. Same order as binary_encoding.

Let me check what phonemeToArray produces for ID=2 again more carefully. The code does:

```
result[digits - 1 - i] = 1;
```

For i=1, digits=6: result[6-1-1] = result[4] = 1

So result = [0, 0, 0, 0, 1, 0]

Now the ground truth says [0, 1, 0, 0, 0, 0].

These are literally different arrays. So either:
1. The ground truth was generated by a DIFFERENT version of the encoding
2. Or I'm reading the code wrong
3. Or the ground truth file description is wrong

Actually, maybe I need to reconsider. Let me check if `outputCount` could be different — in the LipsyncSettings, `outputCount = 6`. But maybe when the ground truth was generated, it had a different value?

Actually, let me look at how the ground truth was generated in the first place. It says "19 phonemes with binary encodings". Let me think about whether there's an alternative interpretation of the code that matches.

Actually, what if `i` in the second loop is typed as `Number` from the first declaration, and `digits - 1 - i` is evaluated as `5 - i` as a Number?

OK no, that's the same thing. Let me just trace one more time very carefully.

digits = 6

First loop: for (var i:Number = 0; i <= 5; i++) result[i] = 0;
→ result = [0,0,0,0,0,0]

Second loop: for (i = 5; i >= 0; i--)
This reuses the same variable `i` (which is type Number, initialized to 0 in first loop, now set to 5).

Iteration i=5:
  if ((2 - Math.pow(2,5)) >= 0) => if ((2-32) >= 0) => if (-30 >= 0) => false
  → no action

Iteration i=4:
  if ((2 - Math.pow(2,4)) >= 0) => if ((2-16) >= 0) => if (-14 >= 0) => false
  → no action

Iteration i=3:
  if ((2 - Math.pow(2,3)) >= 0) => if ((2-8) >= 0) => if (-6 >= 0) => false
  → no action

Iteration i=2:
  if ((2 - Math.pow(2,2)) >= 0) => if ((2-4) >= 0) => if (-2 >= 0) => false
  → no action

Iteration i=1:
  if ((2 - Math.pow(2,1)) >= 0) => if ((2-2) >= 0) => if (0 >= 0) => true
  → result[5-1] = result[4] = 1
  → id = 0

Iteration i=0:
  if ((0 - Math.pow(2,0)) >= 0) => if ((0-1) >= 0) => if (-1 >= 0) => false
  → no action

Final: result = [0,0,0,0,1,0]

This is definitely NOT [0,1,0,0,0,0].

So either:
1. The ground truth was generated by a different function
2. Or the ground truth array is in a different convention

Actually, I think the most likely explanation is that the ground truth's binary_encoding field represents bits in LSB-first order, while the code produces MSB-first (which is also what arrayToPhoneme expects as input). Both are valid conventions, but they differ.

So when verifying, I need to note:
- `phonemeToArray` produces MSB-first: `result[0]` = 2^(digits-1)
- `arrayToPhoneme` expects MSB-first: reads from last element (LSB) backwards
- ground truth `binary_encoding` stores LSB-first: `encoding[0]` = 2^0
- To verify, either reverse the ground truth or reverse the function output

Let me verify this hypothesis: if I reverse the ground truth encoding [0,1,0,0,0,0], I get [0,0,0,0,1,0]. And phonemeToArray(2) produces [0,0,0,0,1,0]. ✓

Similarly for v3a (ID=10):
phonemeToArray(10):
- i=5: 10-32 < 0 → result[0]=0
- i=4: 10-16 < 0 → result[1]=0
- i=3: 10-8 ≥ 0 → result[2]=1, id=2
- i=2: 2-4 < 0 → result[3]=0
- i=1: 2-2 ≥ 0 → result[4]=1, id=0
- i=0: 0-1 < 0 → result[5]=0

Result = [0,0,1,0,1,0]

Reversed: [0,1,0,1,0,0]
Ground truth binary_encoding: [0,1,0,1,0,0] ✓

So my hypothesis is confirmed: the ground truth binary_encoding is LSB-first, which is the REVERSE of phonemeToArray output. The spec document should clearly note this convention difference.

Actually wait, I need to reconsider. Let me look at the alt version of phonemeToArray I wrote:

```typescript
function phonemeToArrayAlt(id: number, digits: number = 6): number[] {
    const masked = id & ((1 << digits) - 1);
    return Array.from({ length: digits }, (_, i) =>
        (masked >> (digits - 1 - i)) & 1
    );
}
```

For ID=2, digits=6:
masked = 2 & 63 = 2
i=0: (2 >> 5) & 1 = 0
i=1: (2 >> 4) & 1 = 0
i=2: (2 >> 3) & 1 = 0
i=3: (2 >> 2) & 1 = 0
i=4: (2 >> 1) & 1 = 1
i=5: (2 >> 0) & 1 = 0
→ [0,0,0,0,1,0]

Same result as the original code. MSB-first.

OK great, so my analysis is correct. Now let me also verify the ground truth for the `arrayToPhoneme` test.

arrayToPhoneme([0,0,0,0,1,0]):
- i=5: array[5]=0, skip, mult=2
- i=4: array[4]=1, result+=2, mult=4
- i=3: array[3]=0, skip, mult=8
- i=2: array[2]=0, skip, mult=16
- i=1: array[1]=0, skip, mult=32
- i=0: array[0]=0, skip, mult=64
Result = 2 → getById(2) → v1a ✓

So the round-trip works: phonemeToArray → arrayToPhoneme produces the same phoneme. The convention difference is only in the ground truth file.

For the spec, I'll document both conventions clearly and provide conversion utilities. I need to make the spec practical. The key insight is that the TypeScript implementation must:
1. Match phonemeToArray/arrayToPhoneme behavior exactly (MSB-first)
2. Provide a conversion function to/from ground truth format (LSB-first)

Let me now also think about edge cases for the phoneme model.

OK, I have all the info. Let me write the phoneme spec now, incorporating these findings.<｜end▁of▁thinking｜>

<｜｜DSML｜｜tool_calls>
<｜｜DSML｜｜invoke name="write_file">
<｜｜DSML｜｜parameter name="content" string="true"># Phoneme Model — TypeScript Algorithm Spec

> **Source files:** `Phoneme.as`, `PhonemeCollection.as`  
> **Config:** `LipsyncSettings.as` → `outputCount = 6`  
> **Ground truth:** `~/LipSync-ts/ground-truth/phoneme-model.json` (19 phonemes with binary encodings)  
> **Verification:** See §7 for full verification procedure.

---

## 1. Phoneme Data Model

### 1.1 TypeScript Interface

```typescript
interface Phoneme {
  readonly symbol: string;   // Viseme group name: "v1"–"v9" or "" (NULL)
  readonly id: number;       // Unique integer identifier 0–63
  readonly visemeId: number; // Viseme group 1–9 (0 for NULL/silence)
}
```

### 1.2 Static Constants

The original ActionScript defines 19 static `Phoneme` constants. In TypeScript these should be defined as a frozen lookup table.

```typescript
const PHONEMES: Phoneme[] = [
  { symbol: "",  id: 0,  visemeId: 0 },  // NULL (silence)
  { symbol: "v1", id: 2,  visemeId: 1 },  // v1a
  { symbol: "v1", id: 3,  visemeId: 1 },  // v1b
  { symbol: "v2", id: 6,  visemeId: 2 },  // v2a
  { symbol: "v2", id: 7,  visemeId: 2 },  // v2b
  { symbol: "v3", id: 10, visemeId: 3 },  // v3a
  { symbol: "v3", id: 11, visemeId: 3 },  // v3b
  { symbol: "v4", id: 14, visemeId: 4 },  // v4a
  { symbol: "v4", id: 15, visemeId: 4 },  // v4b
  { symbol: "v5", id: 20, visemeId: 5 },  // v5a
  { symbol: "v5", id: 21, visemeId: 5 },  // v5b
  { symbol: "v6", id: 30, visemeId: 6 },  // v6a
  { symbol: "v6", id: 31, visemeId: 6 },  // v6b
  { symbol: "v7", id: 40, visemeId: 7 },  // v7a
  { symbol: "v7", id: 41, visemeId: 7 },  // v7b
  { symbol: "v8", id: 52, visemeId: 8 },  // v8a
  { symbol: "v8", id: 53, visemeId: 8 },  // v8b
  { symbol: "v9", id: 62, visemeId: 9 },  // v9a
  { symbol: "v9", id: 63, visemeId: 9 },  // v9b
];
```

### 1.3 ID Selection

Phoneme IDs are deliberately spaced rather than sequential. The a/b variant pairs (difference of 1) share the same viseme group.

| Viseme | a ID | b ID | Viseme ID |
|---|---|---|---|
| v1 | 2 | 3 | 1 |
| v2 | 6 | 7 | 2 |
| v3 | 10 | 11 | 3 |
| v4 | 14 | 15 | 4 |
| v5 | 20 | 21 | 5 |
| v6 | 30 | 31 | 6 |
| v7 | 40 | 41 | 7 |
| v8 | 52 | 53 | 8 |
| v9 | 62 | 63 | 9 |

---

## 2. Lookup Functions (`PhonemeCollection`)

### 2.1 `getById`

```typescript
/**
 * Find a phoneme by its integer ID.
 * Returns NULL phoneme (id=0) if not found.
 */
function getById(id: number): Phoneme {
  const found = PHONEMES.find(p => p.id === id);
  return found ?? PHONEMES[0];  // NULL phoneme as fallback
}
```

### 2.2 Lazy Initialization

The original AS3 code uses a lazy-init pattern in `initCollection()` that populates a static `Vector.<Phoneme>`. TypeScript can use a module-level frozen array instead.

---

## 3. Phoneme → Binary Encoding (`phonemeToArray`)

### 3.1 Algorithm

Converts a phoneme `id` to a binary vector of length `outputCount` (6 bits).

**Convention: MSB-first (big-endian)**  
`result[0]` = most significant bit (2^(digits-1)), `result[digits-1]` = LSB (2^0).

```typescript
/**
 * Convert a phoneme ID to a binary vector (MSB-first).
 *
 * @param id     Phoneme integer ID (0–63)
 * @param digits Number of output bits = LipsyncSettings.outputCount (default 6)
 * @returns Binary vector, length = digits, values 0 or 1
 */
function phonemeToArray(id: number, digits: number = 6): number[] {
  const result = new Array<number>(digits).fill(0);

  // Iterate from MSB power (2^(digits-1)) down to LSB (2^0)
  for (let i = digits - 1; i >= 0; i--) {
    const power = Math.pow(2, i);
    if (id - power >= 0) {
      result[digits - 1 - i] = 1;
      id -= power;
    }
  }

  return result;
}
```

### 3.2 Equivalent Bitwise Form

```typescript
function phonemeToArrayBitwise(id: number, digits: number = 6): number[] {
  return Array.from({ length: digits }, (_, i) =>
    (id >> (digits - 1 - i)) & 1
  );
}
```

### 3.3 Examples

| ID | phonemeToArray (MSB-first) | Ground truth (LSB-first, see §7.1) |
|---|---|---|
| 0 | `[0,0,0,0,0,0]` | `[0,0,0,0,0,0]` |
| 2 (v1a) | `[0,0,0,0,1,0]` | `[0,1,0,0,0,0]` |
| 3 (v1b) | `[0,0,0,0,1,1]` | `[1,1,0,0,0,0]` |
| 6 (v2a) | `[0,0,0,1,1,0]` | `[0,1,1,0,0,0]` |
| 7 (v2b) | `[0,0,0,1,1,1]` | `[1,1,1,0,0,0]` |
| 10 (v3a) | `[0,0,1,0,1,0]` | `[0,1,0,1,0,0]` |
| 11 (v3b) | `[0,0,1,0,1,1]` | `[1,1,0,1,0,0]` |
| 20 (v5a) | `[0,1,0,1,0,0]` | `[0,0,1,0,1,0]` |
| 40 (v7a) | `[1,0,1,0,0,0]` | `[0,0,0,1,0,1]` |
| 52 (v8a) | `[1,1,0,1,0,0]` | `[0,0,1,0,1,1]` |
| 62 (v9a) | `[1,1,1,1,1,0]` | `[0,1,1,1,1,1]` |
| 63 (v9b) | `[1,1,1,1,1,1]` | `[1,1,1,1,1,1]` |

> **NOTE ON GROUND TRUTH CONVENTION:** The ground truth file stores `binary_encoding` and `binary_string` in **LSB-first** order (index 0 = 2⁰ = 1, index 5 = 2⁵ = 32). The code produces **MSB-first** (index 0 = 2⁵ = 32). These are reverses of each other except when symmetric (all-0 or all-1). See §7.1 for conversion.

---

## 4. Binary → Phoneme Decoding (`arrayToPhoneme`)

### 4.1 Algorithm

Converts a 6-element binary vector back to a phoneme by integer reconstruction with ≥0.5 threshold, then `getById`.

```typescript
/**
 * Decode a binary vector to a Phoneme.
 * Reads the array as MSB-first (index 0 = MSB).
 * Uses a ≥0.5 threshold to binarise continuous values.
 *
 * @param array Binary vector from NN output (6 elements, values 0–1)
 * @returns Resolved Phoneme, or NULL phoneme if all entries are NaN
 */
function arrayToPhoneme(array: number[]): Phoneme {
  // NaN test: if the first element is NaN, return NULL
  if (array.length === 0 || isNaN(array[0])) {
    return getById(0);  // NULL phoneme
  }

  // Reconstruct integer from binary (iterates from END = LSB backwards)
  let result = 0;
  let mult = 1;  // 2^0

  for (let i = array.length - 1; i >= 0; i--) {
    if (array[i] >= 0.5) {
      result += mult;
    }
    mult *= 2;
  }

  return getById(result);
}
```

### 4.2 Examples

| Input (MSB-first) | Reconstructed ID | Phoneme |
|---|---|---|
| `[0,0,0,0,0,0]` | 0 | NULL |
| `[0,0,0,0,1,0]` | 2 | v1a |
| `[0,0,0,0,1,1]` | 3 | v1b |
| `[0.99, 0.01, 0.01, 0.01, 0.01, 0.01]` | 32 | (no phoneme) → NULL |
| `[NaN, NaN, NaN, NaN, NaN, NaN]` | — | NULL (early exit) |

### 4.3 Threshold Semantics

The ≥0.5 threshold binarises each element:
- `value ≥ 0.5` → bit = 1
- `value < 0.5` → bit = 0

This matches the NN output (sigmoid, range [0,1]).

---

## 5. Implementation Mapping

### 5.1 Complete TypeScript Module Interface

```typescript
// ── Data ──
export interface Phoneme { symbol: string; id: number; visemeId: number }

// ── Constants ──
export const NULL_PHONEME: Phoneme;
export const PHONEMES: Phoneme[];
export const PHONEME_MAP: Map<number, Phoneme>;  // id → Phoneme

// ── Lookup ──
export function getById(id: number): Phoneme;

// ── Encoding ──
export function phonemeToArray(phoneme: Phoneme, digits?: number): number[];
export function phonemeToArrayFromId(id: number, digits?: number): number[];

// ── Decoding ──
export function arrayToPhoneme(array: number[]): Phoneme;
export function arrayToId(array: number[]): number;

// ── Ground truth compatibility ──
export function phonemeArrayToGroundTruthEncoding(msbFirst: number[]): number[];
export function groundTruthEncodingToPhonemeArray(lsbFirst: number[]): number[];
```

### 5.2 Ground Truth Conversion Utilities

```typescript
/**
 * Convert MSB-first array (from phonemeToArray) to LSB-first
 * format (as stored in ground truth phoneme-model.json).
 */
function toGroundTruthEncoding(msbFirst: number[]): number[] {
  return [...msbFirst].reverse();
}

/**
 * Convert LSB-first array from ground truth to MSB-first
 * format (as produced by phonemeToArray).
 */
function fromGroundTruthEncoding(lsbFirst: number[]): number[] {
  return [...lsbFirst].reverse();
}
```

---

## 6. Edge Cases

### 6.1 Encoding / Decoding

| Edge Case | Expected Behaviour |
|---|---|
| `id < 0` | `id - power` always negative → all bits 0 → decoded back to 0 (NULL) |
| `id > 2^digits - 1` | Only the lower 6 bits are extracted; e.g., id=64 → `[0,0,0,0,0,0]` (wraps to 0) |
| `digits = 0` | `new Array(0)` → empty return; `arrayToPhoneme` sees empty array → NaN check → NULL |
| `digits ≠ 6` | Should use `LipsyncSettings.outputCount` for interoperability; encoding/decoding works for any digit count |
| All elements `NaN` in decoder | `isNaN(array[0])` → early return NULL |
| All elements `undefined` | `array[0]` is `undefined` → `isNaN(undefined)` is `true` → NULL |
| Threshold exactly 0.5 | `array[i] >= 0.5`: 0.5 passes as bit=1 |
| Threshold exactly 0.4999… | Fails (bit=0) |
| Empty array | `length === 0` → NaN check → NULL |

### 6.2 Lookup

| Edge Case | Expected Behaviour |
|---|---|
| `id=0` | Returns NULL phoneme (first entry) |
| `id=1,4,5,8,9,12,13,…` (not in table) | Returns NULL phoneme — **no error thrown** |
| `id > 63` | Returns NULL phoneme |

### 6.3 ID Domain

The 6-bit encoding supports IDs 0–63, but only 19 are registered phonemes. When the NN outputs a 6-bit value whose ID is not in the table, `getById` returns the NULL phoneme. This is not an error — it means the network produced an unrecognised viseme pattern.

Unmapped IDs include: `1, 4, 5, 8, 9, 12, 13, 16, 17, 18, 19, 22, 23, 24, 25, 26, 27, 28, 29, 32–39, 42–51, 54–61` (32 unmapped IDs).

---

## 7. Ground Truth Verification

### 7.1 Convention Difference

The ground truth file `phoneme-model.json` stores `binary_encoding` in **LSB-first** order:

```
binary_encoding[0] = 2⁰ = 1   (least significant bit)
binary_encoding[5] = 2⁵ = 32  (most significant bit)
```

The code (`phonemeToArray`) produces **MSB-first** order:

```
result[0] = 2⁵ = 32   (most significant bit)
result[5] = 2⁰ = 1    (least significant bit)
```

The two encodings are **reverses of each other**, as illustrated by the example divergences in §3.3. Both conventions are internally consistent — the key requirement is that `phonemeToArray(x)` round-trips with `arrayToPhoneme`.

### 7.2 Verification Procedure

```typescript
/**
 * Verify the phoneme model against the ground truth file.
 * Must pass for all 19 phonemes.
 */
function verifyPhonemeModel(
  groundTruthFile: string,
  digits: number = 6
): boolean {
  const gt = JSON.parse(fs.readFileSync(groundTruthFile, 'utf8')) as {
    constant: string;
    id: number;
    viseme_id: number;
    binary_encoding: number[];
    binary_string: string;
  }[];

  for (const entry of gt) {
    // 1. Verify phonemeToArray round-trips
    const encoded = phonemeToArrayFromId(entry.id, digits);
    const decoded = arrayToPhoneme(encoded);
    if (decoded.id !== entry.id) {
      console.error(`Round-trip failed for ID ${entry.id}`);
      return false;
    }

    // 2. Verify ground truth encoding (LSB-first) is the reverse of code output
    const gtEncoding = entry.binary_encoding;
    const reversedFromCode = [...encoded].reverse();
    for (let i = 0; i < digits; i++) {
      if (Math.abs(reversedFromCode[i] - gtEncoding[i]) > 1e-10) {
        console.error(
          `Ground truth mismatch for ${entry.constant} (ID=${entry.id}): ` +
          `code MSB=${JSON.stringify(encoded)}, ` +
          `reversed=${JSON.stringify(reversedFromCode)}, ` +
          `ground truth LSB=${JSON.stringify(gtEncoding)}`
        );
        return false;
      }
    }
  }
  return true;
}
```

### 7.3 Complete Verification Checklist

- [ ] All 19 phonemes exist in the `PHONEMES` array
- [ ] `phonemeToArray(0)` → `[0,0,0,0,0,0]`
- [ ] `phonemeToArray(63)` → `[1,1,1,1,1,1]`
- [ ] `phonemeToArray(x)` round-trips with `arrayToPhoneme` for all 19 IDs
- [ ] `arrayToPhoneme([NaN, …])` → NULL phoneme (id=0)
- [ ] `getById(unmapped_id)` → NULL phoneme (no crash)
- [ ] Ground truth `binary_encoding` matches `phonemeToArray(id).reverse()` for all 19 entries
- [ ] Ground truth `binary_string` matches `binary_encoding.join('')` for all 19 entries

---

## 8. Files to Verify Against

| File | Path | What it verifies |
|---|---|---|
| `phoneme-model.json` | `~/LipSync-ts/ground-truth/phoneme-model.json` | All 19 phoneme definitions, binary encodings (LSB-first), `arrayToPhoneme` threshold behaviour |
| `nn-weights.json` | `~/LipSync-ts/ground-truth/nn-weights.json` | NN output layer dimension (6 neurons) must match `outputCount`; test vectors verify the encode → decode → phoneme pipeline end-to-end |
| `audio-pipeline.json` | `~/LipSync-ts/ground-truth/audio-pipeline.json` | End-to-end: LPC → NN → `arrayToPhoneme` → phoneme dispatch |

---

## 9. Viseme Mapping (for downstream consumers)

The phoneme model feeds into the 3D avatar system. After decoding, `phoneme.visemeId` (1–9) is used to look up viseme expressions:

```typescript
// After LipsyncPlayer: NN output → arrayToPhoneme → phoneme
// The visemeId drives the avatar:
//   ExpressionsCollection.getVisemeById(phoneme.visemeId)
//   → 14-parameter expression (mouth shape)
//   → AvatarMouth.setViseme(value, expression)
//   → 14 bone axes animated via inertia-blended BoneRot/BoneMov
```

The 3-point temporal smoothing filter (in LipsyncPlayer) removes isolated single-frame phoneme flickers before viseme dispatch.
