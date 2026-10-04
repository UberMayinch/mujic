/**
 * JSON Schema for the LLM's response.
 *
 * Structured outputs constrain the model to exactly this shape, so the server
 * never parses free text and the client never receives an op it can't apply.
 * Every object needs `required` + `additionalProperties: false`.
 */

const trackRef = {
  type: "string",
  description: 'The track name as listed in the prompt, e.g. "hats".',
} as const;

const sectionRef = {
  type: "string",
  description:
    'The section name, e.g. "chorus". Only set this when the user names a section ("in the chorus, ..."). ' +
    "Omit it to edit the section they are currently looking at.",
} as const;

export const EDIT_OPS_SCHEMA = {
  type: "object",
  properties: {
    ops: {
      type: "array",
      description: "The edits to apply, in order. Empty if the request is not an edit.",
      items: {
        anyOf: [
          {
            type: "object",
            properties: {
              op: { type: "string", const: "set_pattern" },
              track: trackRef,
              pattern: {
                type: "string",
                description:
                  'Strudel mini-notation, e.g. "bd*4", "hh*16", "~ sd ~ sd", "bd(3,8)". Use the track\'s sound name.',
              },
              section: sectionRef,
            },
            required: ["op", "track", "pattern"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: {
              op: { type: "string", const: "set_cell" },
              track: trackRef,
              mode: {
                type: "string",
                enum: ["inherit", "silent"],
                description:
                  '"silent" drops the track for this section ("no drums in the breakdown"); ' +
                  '"inherit" makes it carry over whatever the previous section played.',
              },
              section: sectionRef,
            },
            required: ["op", "track", "mode"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: {
              op: { type: "string", const: "set_param" },
              track: trackRef,
              param: { type: "string", enum: ["gain", "room", "lpf", "speed"] },
              value: { type: "number" },
            },
            required: ["op", "track", "param", "value"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: {
              op: { type: "string", const: "toggle" },
              track: trackRef,
              field: { type: "string", enum: ["muted", "soloed"] },
              value: { type: "boolean" },
            },
            required: ["op", "track", "field", "value"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: {
              op: { type: "string", const: "add_track" },
              name: { type: "string", description: 'Short spoken handle, e.g. "bass".' },
              kind: {
                type: "string",
                enum: ["sample", "note"],
                description:
                  'Use "note" for anything pitched (bassline, melody, chords) and "sample" for drums. Defaults to "sample".',
              },
              sound: {
                type: "string",
                description:
                  'For a drum track, the sample: bd, sd, hh, oh, cp, rim, lt, mt, ht. ' +
                  'For a "note" track, the instrument: triangle, sawtooth, square, piano, gm_epiano1.',
              },
              pattern: { type: "string" },
              section: sectionRef,
            },
            required: ["op", "name", "sound", "pattern"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: {
              op: { type: "string", const: "remove_track" },
              track: trackRef,
            },
            required: ["op", "track"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: {
              op: { type: "string", const: "add_section" },
              name: { type: "string", description: 'Song-section name, e.g. "chorus", "breakdown".' },
              bars: { type: "number", description: "Length in bars. 8 is a reasonable default." },
              after: {
                type: "string",
                description: "Name of the section it should follow. Omit to append to the end of the timeline.",
              },
            },
            required: ["op", "name", "bars"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: {
              op: { type: "string", const: "remove_section" },
              section: { type: "string" },
            },
            required: ["op", "section"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: {
              op: { type: "string", const: "set_section_bars" },
              section: { type: "string" },
              bars: { type: "number" },
            },
            required: ["op", "section", "bars"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: {
              op: { type: "string", const: "set_bpm" },
              bpm: { type: "number" },
            },
            required: ["op", "bpm"],
            additionalProperties: false,
          },
        ],
      },
    },
    reply: {
      type: "string",
      description:
        "One short sentence for the user. Confirm what changed, or say what was ambiguous if ops is empty.",
    },
  },
  required: ["ops", "reply"],
  additionalProperties: false,
} as const;
