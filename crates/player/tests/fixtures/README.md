# Audio decoder fixture

`tone.mp3.hex` is a synthetic 440 Hz mono test signal, not a generated game asset,
licensed as project test data under the repository license. Input: 4,410 signed
16-bit samples at 44,100 Hz, amplitude 8,000; round(8000 * sin(i * 2π * 440 / 44100)).
Encoded with the upstream `lamejs@1.2.1` bundled `lame.all.js`, Mp3Encoder(1, 44100,
128), blocks of 1,152 samples followed by flush. The encoder is a fixture-generation
tool only and is not shipped or required to run tests. Encoder source and license:
https://github.com/zhuker/lamejs .

Decoded hex is 2,089 bytes; SHA-256:
`14b7d6a7177a1aa0bf24e7254c27d88f0ad86046daebcc712681bb147d212fdb`.
MP3 frame padding means measured duration need not equal the 100 ms input length.
Tests must use measured decoder metadata, not the generation request's duration.
