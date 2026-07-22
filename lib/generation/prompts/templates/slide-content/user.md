# Generation Requirements

## Scene Information

- **Title**: {{title}}
- **Description**: {{description}}
- **Key Points**:
  {{keyPoints}}

{{teacherContext}}

## Available Resources

- **Available Images**: {{assignedImages}}
- **Canvas Size**: {{canvas_width}} × {{canvas_height}} px

## Output Requirements

Based on the scene information above, generate a complete Canvas/PPT component for one page.

**Language Requirement**: All generated text content must be in the same language as the title and description above.

**Must Follow**:

1. Output pure JSON directly, without any explanation or description
2. Do not wrap with ```json code blocks
3. Do not add any text before or after the JSON
4. Ensure the JSON format is correct and can be parsed directly
5. Use the provided image_id (e.g., `img_001`) for the `src` field of image elements
6. All TextElement `height` values must be selected from the quick reference table in the system prompt

**Design Requirements**:
- **Be Creative & Professional**: DO NOT just output a single text block with bullet points. Use the shapes, lines, and multi-column card layouts described in the system prompt.
- **Visual Hierarchy**: Use colored background shapes (`type: "shape"`) to group related points into cards.
- **Layout**: If there are 2 or 3 parallel points, place them side-by-side using the multi-column layout rules. Use dividers (`type: "line"` or thin `shape`) to separate header from content.
