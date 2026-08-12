import {
  fitProjection,
  projectPoint,
  subsamplePoints,
} from '../landmark-overlay';

/**
 * F65: 좌표 환산을 고정한다.
 *
 * 실기기에서 점이 얼굴에서 밀려 보인 원인이 사진(`cover`)과 오버레이(`none`)의
 * 좌표계 불일치였다. 화면을 눈으로 봐야만 알 수 있던 버그라 환산을 함수로 떼어
 * 여기서 잡는다.
 */
describe('fitProjection', () => {
  it('박스와 원본 비율이 같으면 여백 없이 꽉 찬다', () => {
    expect(fitProjection({ width: 300, height: 400 }, { width: 600, height: 800 }, 'cover'))
      .toEqual({ scale: 0.5, offsetX: 0, offsetY: 0 });
  });

  it('cover — 원본이 더 넓으면 좌우가 잘리고 offsetX가 음수가 된다', () => {
    // 박스 200×200, 원본 400×200 → 세로를 채우려면 배율 1, 가로는 400이라 200 넘침
    const projection = fitProjection(
      { width: 200, height: 200 },
      { width: 400, height: 200 },
      'cover',
    );
    expect(projection.scale).toBe(1);
    expect(projection.offsetX).toBe(-100);
    expect(projection.offsetY).toBe(0);
  });

  it('cover — 원본이 더 높으면 위아래가 잘린다', () => {
    const projection = fitProjection(
      { width: 200, height: 200 },
      { width: 200, height: 400 },
      'cover',
    );
    expect(projection).toEqual({ scale: 1, offsetX: 0, offsetY: -100 });
  });

  it('contain — 원본이 다 들어가고 남는 쪽에 여백이 생긴다', () => {
    const projection = fitProjection(
      { width: 200, height: 200 },
      { width: 400, height: 200 },
      'contain',
    );
    expect(projection).toEqual({ scale: 0.5, offsetX: 0, offsetY: 50 });
  });

  it('측정 전(0 크기)에는 배율 0을 준다 — NaN이 좌표로 새어 나가면 안 된다', () => {
    expect(fitProjection({ width: 0, height: 0 }, { width: 400, height: 300 }, 'cover'))
      .toEqual({ scale: 0, offsetX: 0, offsetY: 0 });
    expect(fitProjection({ width: 200, height: 200 }, { width: 0, height: 0 }, 'cover'))
      .toEqual({ scale: 0, offsetX: 0, offsetY: 0 });
  });
});

describe('projectPoint', () => {
  const source = { width: 400, height: 300 };

  it('비율이 같으면 정규화 좌표가 박스 비율 그대로 옮겨진다', () => {
    const box = { width: 200, height: 150 };
    const projection = fitProjection(box, source, 'cover');

    expect(projectPoint([0, 0], source, projection)).toEqual({ x: 0, y: 0 });
    expect(projectPoint([0.5, 0.5], source, projection)).toEqual({ x: 100, y: 75 });
    expect(projectPoint([1, 1], source, projection)).toEqual({ x: 200, y: 150 });
  });

  it('cover로 잘릴 때도 얼굴 중앙(0.5, 0.5)은 박스 중앙에 온다', () => {
    // 잘려도 중앙 정렬이라 중심은 유지된다. 점이 밀렸다면 여기가 어긋난다.
    const box = { width: 140, height: 160 };
    const projection = fitProjection(box, source, 'cover');

    expect(projectPoint([0.5, 0.5], source, projection)).toEqual({ x: 70, y: 80 });
  });

  it('cover에서 잘린 가장자리는 박스 밖 좌표가 된다', () => {
    const box = { width: 200, height: 200 };
    const wide = { width: 400, height: 200 };
    const projection = fitProjection(box, wide, 'cover');

    expect(projectPoint([0, 0.5], wide, projection).x).toBe(-100);
    expect(projectPoint([1, 0.5], wide, projection).x).toBe(300);
  });

  it('실기기 첫 점 [0.5039, 0.6176]이 박스 중앙 근처에 찍힌다', () => {
    // F65 조사에서 API로 받은 실제 좌표. 얼굴 중앙 부근이므로 박스 중앙 근처여야 한다.
    const box = { width: 300, height: 300 };
    const square = { width: 1000, height: 1000 };
    const projection = fitProjection(box, square, 'cover');
    const point = projectPoint([0.5039, 0.6176], square, projection);

    expect(point.x).toBeCloseTo(151.17, 2);
    expect(point.y).toBeCloseTo(185.28, 2);
  });
});

describe('subsamplePoints', () => {
  const points = Array.from({ length: 478 }, (_, i) => i);

  it('max 이하면 그대로 둔다', () => {
    expect(subsamplePoints([1, 2, 3], 10)).toEqual([1, 2, 3]);
  });

  it('솎아낸 뒤에도 max를 넘지 않는다', () => {
    expect(subsamplePoints(points, 80).length).toBeLessThanOrEqual(80);
  });

  it('앞에서 자르지 않고 전체에서 고르게 고른다 — 얼굴 한쪽만 남으면 안 된다', () => {
    const picked = subsamplePoints(points, 80);

    expect(picked[0]).toBe(0);
    // 마지막으로 고른 점이 끝부분에서 나와야 전체가 덮인다.
    expect(picked[picked.length - 1]).toBeGreaterThan(points.length - 10);
  });

  it('원본을 바꾸지 않는다', () => {
    const original = [1, 2, 3];
    expect(subsamplePoints(original, 2)).not.toBe(original);
    expect(original).toEqual([1, 2, 3]);
  });

  it('max가 0 이하면 빈 배열', () => {
    expect(subsamplePoints(points, 0)).toEqual([]);
  });
});
