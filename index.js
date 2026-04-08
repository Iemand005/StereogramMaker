const shader = `
void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    float numTiles = 6.0;
    float maxDepthShift = 20.0;
    
    float tileWidth = iResolution.x / numTiles;
    
    float currX = fragCoord.x;
    float y = fragCoord.y;

    // Normalized pixel coordinates (from 0 to 1)
    vec2 uv = fragCoord / iResolution.xy;

    // Get depth value for pixel
    float depth = texture(iChannel1, uv).r;
    
    while (currX > tileWidth) {
        // Get depth at the current spot (0.0 to 1.0)
        float depth = texture(iChannel1, vec2(currX, y) / iResolution.xy).r;
        
        // Subtract the tile width, but shift it slightly based on depth
        // More depth (whiter) = smaller jump = pixels look "closer"
        currX -= (tileWidth - depth * maxDepthShift);
    }
    
    
    // Get the colour of the offset texture coordinates
    vec4 col = texture(iChannel1, uv + vec2(depth * 0.1, 0.0));
    

    // Output to screen
    vec2 patternUV = vec2(currX / tileWidth, y / iResolution.y);
    fragColor = texture(iChannel0, patternUV);
}
`;

