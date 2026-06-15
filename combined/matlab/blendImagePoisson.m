function imret = blendImagePoisson(im1, im2, roi, targetPosition, mode)

% input: im1 (background), im2 (foreground), roi (in im2), targetPosition (in im1)
% mode: 'import' (default) or 'mixing'

if nargin < 5
    mode = 'import';
end

im1d = im2double(im1);
im2d = im2double(im2);
[h1, w1, ch] = size(im1d);
[h2, w2, ~] = size(im2d);

roi = double(roi);
targetPosition = double(targetPosition);
offset = round(mean(targetPosition - roi, 1));

mask = poly2mask(roi(:, 1), roi(:, 2), h2, w2);
[ys, xs] = find(mask);

valid = xs + offset(1) >= 1 & xs + offset(1) <= w1 & ...
        ys + offset(2) >= 1 & ys + offset(2) <= h1;
xs = xs(valid);
ys = ys(valid);

id = zeros(h2, w2);
for k = 1:numel(xs)
    id(ys(k), xs(k)) = k;
end

n = numel(xs);
rows = zeros(n * 5, 1);
cols = zeros(n * 5, 1);
vals = zeros(n * 5, 1);
b = zeros(n, ch);
ptr = 1;

dx = [1, -1, 0, 0];
dy = [0, 0, 1, -1];

for k = 1:n
    x = xs(k);
    y = ys(k);
    tx = x + offset(1);
    ty = y + offset(2);

    diagv = 0;
    for d = 1:4
        qx = x + dx(d);
        qy = y + dy(d);
        tqx = tx + dx(d);
        tqy = ty + dy(d);

        if qx < 1 || qx > w2 || qy < 1 || qy > h2 || ...
           tqx < 1 || tqx > w1 || tqy < 1 || tqy > h1
            continue;
        end

        diagv = diagv + 1;
        qid = id(qy, qx);

        for c = 1:ch
            sourceGrad = im2d(y, x, c) - im2d(qy, qx, c);
            if strcmp(mode, 'mixing')
                targetGrad = im1d(ty, tx, c) - im1d(tqy, tqx, c);
                if abs(targetGrad) > abs(sourceGrad)
                    grad = targetGrad;
                else
                    grad = sourceGrad;
                end
            else
                grad = sourceGrad;
            end
            b(k, c) = b(k, c) + grad;
            if qid == 0
                b(k, c) = b(k, c) + im1d(tqy, tqx, c);
            end
        end

        if qid > 0
            rows(ptr) = k;
            cols(ptr) = qid;
            vals(ptr) = -1;
            ptr = ptr + 1;
        end
    end

    rows(ptr) = k;
    cols(ptr) = k;
    vals(ptr) = diagv;
    ptr = ptr + 1;
end

A = sparse(rows(1:ptr - 1), cols(1:ptr - 1), vals(1:ptr - 1), n, n);
solution = zeros(n, ch);
for c = 1:ch
    solution(:, c) = A \ b(:, c);
end

imret = im1d;
for k = 1:n
    tx = xs(k) + offset(1);
    ty = ys(k) + offset(2);
    imret(ty, tx, :) = reshape(solution(k, :), 1, 1, ch);
end

imret = im2uint8(min(max(imret, 0), 1));
