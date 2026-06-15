# Homework 2 - Option 2

本目录已经整理成可提交的作业包，包含代码、实验结果、交互网站、实验报告和环境配置文件。

## 目录结构

- `code/run_all.py`：运行全部实验，生成结果图与结果表。
- `code/webapp.py`：启动网页应用，支持实验展示与图片上传去噪。
- `code/build_report.py`：根据实验结果自动生成 `report.md` 与 `report.pdf`。
- `code/results/optional_metrics.md`：RSLRT 与 TILT 进阶模型验证的结果汇总表。
- `code/report/report.pdf`：可直接提交的实验报告。
- `code/results/`：实验图表、指标表和网站预览图。
- `requirements.txt` / `environment.yml`：环境配置文件。

## 运行方式

```bash
python3 code/run_all.py
python3 code/webapp.py
python3 code/build_report.py
```

启动后访问：

```bash
http://127.0.0.1:8000
```

## 实现说明

- RPCA 主循环、软阈值算子和奇异值阈值算子均为手写实现。
- RSLRT 实现了 `Repairing Sparse Low-rank Texture` 的低秩 + DCT 稀疏双先验修复。
- TILT 实现了 affine / projective 两种整形模式。
- SVD 由 `numpy.linalg.svd` 提供。
- 网站后端使用 Python 标准库 HTTP 服务，前端使用原生 HTML/CSS/JS。
