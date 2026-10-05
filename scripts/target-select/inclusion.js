/**
 * Which Tokens sit in an Area. Pure geometry in the same units as Token bounds.
 * A Token with no actor is not in the Area.
 */

const CONE_HALF_ANGLE = (26.5 * Math.PI) / 180;

/**
 * @param {Array<{x:number,y:number,w:number,h:number,hasActor:boolean}>} tokens
 * @param {{kind:string, origin:{x:number,y:number}, toward?:{x:number,y:number}, size:number}} shape
 * @returns {Array<object>}
 */
export function tokensInArea(tokens, shape) {
    if (!Array.isArray(tokens) || !shape?.origin || !(shape.size > 0)) return [];
    return tokens.filter((token) => token?.hasActor && tokenHits(token, shape));
}

function tokenHits(token, shape) {
    const kind = shape.kind;
    if (kind === 'square' || kind === 'cube') return rectHitsSquare(token, shape);
    if (kind === 'cone') return rectHitsCone(token, shape);
    if (kind === 'line') return rectHitsLine(token, shape);
    return rectHitsCircle(token, shape.origin.x, shape.origin.y, shape.size);
}

function rectHitsCircle(rect, cx, cy, radius) {
    const nearestX = clamp(cx, rect.x, rect.x + rect.w);
    const nearestY = clamp(cy, rect.y, rect.y + rect.h);
    const dx = cx - nearestX;
    const dy = cy - nearestY;
    return dx * dx + dy * dy <= radius * radius;
}

function rectHitsSquare(rect, shape) {
    const half = shape.size / 2;
    const left = shape.origin.x - half;
    const top = shape.origin.y - half;
    return rectsOverlap(rect, { x: left, y: top, w: shape.size, h: shape.size });
}

function rectHitsCone(rect, shape) {
    const toward = shape.toward;
    if (!toward) return false;
    const points = corners(rect);
    return points.some((point) => pointInCone(point, shape.origin, toward, shape.size));
}

function rectHitsLine(rect, shape) {
    const toward = shape.toward;
    if (!toward) return false;
    const width = shape.width > 0 ? shape.width : 0;
    return corners(rect).some((point) => pointNearSegment(point, shape.origin, toward, shape.size, width / 2));
}

function pointInCone(point, origin, toward, length) {
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;
    const dist = Math.hypot(dx, dy);
    if (dist > length || dist === 0) return dist === 0;
    const tx = toward.x - origin.x;
    const ty = toward.y - origin.y;
    const tlen = Math.hypot(tx, ty);
    if (!tlen) return false;
    const dot = (dx * tx + dy * ty) / (dist * tlen);
    const angle = Math.acos(Math.min(1, Math.max(-1, dot)));
    return angle <= CONE_HALF_ANGLE;
}

function pointNearSegment(point, origin, toward, length, halfWidth) {
    const tx = toward.x - origin.x;
    const ty = toward.y - origin.y;
    const tlen = Math.hypot(tx, ty);
    if (!tlen) return false;
    const ux = tx / tlen;
    const uy = ty / tlen;
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;
    const along = dx * ux + dy * uy;
    if (along < 0 || along > length) return false;
    const px = origin.x + ux * along;
    const py = origin.y + uy * along;
    return Math.hypot(point.x - px, point.y - py) <= halfWidth;
}

function corners(rect) {
    return [
        { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 },
        { x: rect.x, y: rect.y },
        { x: rect.x + rect.w, y: rect.y },
        { x: rect.x, y: rect.y + rect.h },
        { x: rect.x + rect.w, y: rect.y + rect.h }
    ];
}

function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

/**
 * Map an Adapter template type to a shape kind.
 * @param {string} type
 * @returns {'circle'|'square'|'cone'|'line'}
 */
export function areaKind(type) {
    if (type === 'cube') return 'square';
    if (type === 'cone') return 'cone';
    if (type === 'line') return 'line';
    return 'circle';
}
