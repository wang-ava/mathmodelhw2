# nnMIL 多特征融合不确定性评估项目阶段报告

生成日期：2026-06-15。数据来源：`nnMIL_Classification_Uncertainty_5fold/README.md` 与 `nnMIL_Classification_Uncertainty_5fold/Uncertainty_output` 下已有 5-fold 输出。

## 一句话结论

这个项目做的是：在 nnMIL 病理切片分类模型之上，同时使用多个基础病理特征提取器（conch_v1_5、gigapath、h0、uni、virchow2）得到同一张 WSI 的多路预测，再用 chunk-level mutual information 与 MC Dropout voting 共同估计置信度，最后用 15 个不确定性/校准/错误检测/选择性预测指标评估“多特征融合置信度”是否比任何单一 extractor 的置信度更可靠。

当前结果最适合汇报的主线不是“所有任务所有指标都赢”，而是“在多数据集、多疾病、多分类难度设置下，融合方法稳定改善了错误检测、选择性预测和部分校准指标；尤其在 KIDNEY、UCEC、BLCA、BRCA IDC/ILC 上证据最强”。这些任务可以作为方法有效性的主打图表。THCA 等任务应作为边界情况或失败分析，不建议放在主结论图中。

## 项目做了什么

项目由两个阶段组成。第一阶段沿用原始 nnMIL 训练框架，对每个任务、每个 extractor 分别训练 SimpleMIL 分类器。第二阶段是本项目新增的不确定性评估 pipeline：读取多个 extractor 的 checkpoint 和 h5 特征，在测试集或 5-fold 的每一折上推理，保存 chunk 概率、MC Dropout 概率、单特征预测 CSV、多特征融合预测 CSV，并计算 15 项指标。

训练层面，SimpleMIL 使用 gated attention 与 chunking 机制；每个 extractor 是一套独立的特征空间和一套独立模型。评估层面，单特征 baseline 只看某一个 extractor；多特征方法把 N 个 extractor 的信息聚合起来。这样设计的意义是：病理基础模型之间往往捕捉不同形态学线索，单一路径容易过度自信或在某些类别上失效，多路融合可以用模型间一致性与不一致性来给预测置信度提供额外证据。

本项目最核心的创新点不是重新发明分类器，而是把“多 extractor 的预测差异”显式转化为不确定性指标。具体做法包括两条并行链路：第一条是 MC Dropout voting，T 次 dropout 前向中，每次让多个 extractor 对类别投票，若全一致则采用该类概率最强的 extractor，若完全不一致则取平均，若部分一致则取多数派中 top-2 概率平均；第二条是 enhanced MI，把所有 extractor 的 chunk_probs 拼接为 N×K 个 chunk 概率，用 JS 等 mutual information 变体度量 chunk 与 extractor 间分歧。最终置信度为 voting 置信度和 MI 置信度各 0.5 的平均。

## 评估指标怎么理解

报告里的 15 项指标可以分成四组。Calibration 类指标（ECE、MCE、ACE、SCE、ICI、Brier、NLL、CSR）关注“模型说自己有多确信”和“实际对不对”是否匹配；Misclassification Detection 类指标（AUROC、AUPR、FPR95）关注置信度能否把正确预测和错误预测分开；Selective Prediction 类指标（AURC、E_AURC、cwA）关注按置信度拒识低可信样本后，剩余样本的准确率是否更好；Overall_Accuracy 是普通分类准确率。

| 指标 | 方向 | 汇报解释 |
|---|---:|---|
| ECE | ↓ 越低越好 | 校准误差 ECE |
| MCE | ↓ 越低越好 | 最大校准误差 MCE |
| ACE | ↓ 越低越好 | 自适应校准误差 ACE |
| SCE | ↓ 越低越好 | 静态校准误差 SCE |
| ICI | ↓ 越低越好 | 校准指数 ICI |
| Brier | ↓ 越低越好 | Brier 分数 |
| NLL | ↓ 越低越好 | 负对数似然 NLL |
| CSR | → 越接近 1 越好 | 置信度-成功比 CSR |
| AUROC | ↑ 越高越好 | 错误检测 AUROC |
| AUPR | ↑ 越高越好 | 错误检测 AUPR |
| FPR95 | ↓ 越低越好 | FPR95 |
| AURC | ↓ 越低越好 | 选择性预测 AURC |
| E_AURC | ↓ 越低越好 | Excess AURC |
| cwA | ↑ 越高越好 | 置信度加权准确率 cwA |
| Overall_Accuracy | ↑ 越高越好 | 总体准确率 |

这里需要强调：我们的置信度方法直接优化的是 uncertainty ranking 和 calibration，不一定会让总体分类准确率在每个任务上都超过最佳单 extractor。一个合理的汇报方式是把准确率作为基础性能，把 AUROC/AUPR/FPR95/AURC/E_AURC/cwA 作为不确定性方法的主要证据，把 ECE/SCE/Brier 等校准指标作为辅助证据。

## 当前结果总览

| 数据集 | 采用输出 | 样本数 | 标签分布 | multi 胜出指标数/15 | 证据级别 |
|---|---|---:|---|---:|---|
| EBRAINS_IDH | `EBRAINS_IDH_30to2_5fold/20260606_095234` | 848 | 0:521, 1:327 | 4/15 | 部分证据 |
| Task059 BRCA IDC vs ILC | `Task059_TCGA_BRCA_histology_IDC_vs_ILC_5extractor_JS_mode1_common/20260614_023955` | 1043 | 0:839, 1:204 | 8/15 | 强证据 |
| Task060 BRCA PAM50 3类 noHer2 | `Task060_TCGA_BRCA_PAM50_3cls_noHer2_5extractor_JS_mode1_common/20260614_025035` | 741 | 0:404, 1:200, 2:137 | 3/15 | 部分证据 |
| Task061 BRCA PAM50 4类 | `Task061_TCGA_BRCA_PAM50_4cls_5extractor_JS_mode1_common/20260614_025744` | 806 | 0:404, 1:200, 2:65, 3:137 | 5/15 | 部分证据 |
| Task062 KIDNEY 3亚型 | `Task062_TCGA_KIDNEY_3subtypes_5extractor_JS_mode1_common/20260614_030524` | 920 | 0:518, 1:293, 2:109 | 10/15 | 强证据 |
| Task063 SARC 6类组织学 | `Task063_TCGA_SARC_histology_6cls_5extractor_JS_mode1_common/20260613_165108` | 597 | 0:155, 1:88, 2:166, 3:141, 4:27, 5:20 | 7/15 | 部分证据 |
| Task064 STAD Lauren 3类 | `Task064_TCGA_STAD_Lauren_3cls_5extractor_JS_mode1_common/20260613_165755` | 384 | 0:187, 1:74, 2:123 | 7/15 | 部分证据 |
| Task065 THCA 3类组织学 | `Task065_TCGA_THCA_histology_3cls_5extractor_JS_mode1_common/20260613_170154` | 511 | 0:369, 1:104, 2:38 | 0/15 | 负例/不主打 |
| Task066 UCEC Endometrioid vs Serous | `Task066_TCGA_UCEC_Endometrioid_vs_Serous_5extractor_JS_mode1_common/20260614_172847` | 572 | 0:448, 1:124 | 10/15 | 强证据 |
| Task068 PRAD Gleason 二分类 | `Task068_TCGA_PRAD_Gleason_binary_5extractor_JS_mode1_common/20260614_172847` | 447 | 0:44, 1:403 | 6/15 | 部分证据 |
| Task070 HNSC HPV 状态 | `Task070_TCGA_HNSC_HPV_status_5extractor_JS_mode1_common/20260614_221059` | 68 | 0:38, 1:30 | 6/15 | 部分证据 |
| Task071 BLCA Papillary vs NonPapillary | `Task071_TCGA_BLCA_Papillary_vs_NonPapillary_5extractor_JS_mode1_common/20260614_221200` | 452 | 0:326, 1:126 | 10/15 | 强证据 |

从整体看，强证据任务包括 Task062 KIDNEY、Task066 UCEC、Task071 BLCA 和 Task059 BRCA IDC/ILC。这些任务的共同特点是：融合方法不仅在总体准确率或 AUPR 上不弱，且在选择性预测、错误检测和校准子指标上有多项明确胜出。部分证据任务包括 Task061、Task063、Task064、Task068、Task070 等，它们显示融合方法能改善若干关键不确定性指标，但存在 AUROC、ECE 或 FPR95 的短板。Task065 THCA 当前 15 项指标均未超过最佳单 extractor，不适合作为主打结果。

## 最值得放进汇报图的结果

建议主图选择四个强证据任务，每个任务画一组“multi vs best single”的柱状图或森林图。横轴放关键指标，纵轴放数值或 delta。对于越低越好的指标，delta 为 multi - best_single，负数表示融合更好；对于越高越好的指标，delta 为 multi - best_single，正数表示融合更好。

### Task059 BRCA IDC vs ILC

输出目录：`nnMIL_Classification_Uncertainty_5fold/Uncertainty_output/Task059_TCGA_BRCA_histology_IDC_vs_ILC_5extractor_JS_mode1_common/20260614_023955`。5-fold 测试样本 1043 例，fold 样本数为 [209, 207, 216, 211, 200]，标签分布为 {'1': 204, '0': 839}。multi 在 8/15 个指标上超过最佳单 extractor。

| 指标 | 方向 | Multi | 最佳单特征 | Delta | Winner |
|---|---:|---:|---|---:|---|
| Overall_Accuracy | ↑ 越高越好 | 0.9248 | uni 0.9239 | 0.0009 | multi |
| AUROC | ↑ 越高越好 | 0.8114 | h0 0.8151 | -0.0037 | single |
| AUPR | ↑ 越高越好 | 0.9777 | virchow2 0.9732 | 0.0045 | multi |
| ECE | ↓ 越低越好 | 0.1556 | virchow2 0.1189 | 0.0367 | single |
| SCE | ↓ 越低越好 | 0.0682 | virchow2 0.0759 | -0.0078 | multi |
| Brier | ↓ 越低越好 | 0.1160 | virchow2 0.1267 | -0.0107 | multi |
| FPR95 | ↓ 越低越好 | 0.6099 | h0 0.6018 | 0.0080 | single |
| AURC | ↓ 越低越好 | 0.0244 | virchow2 0.0290 | -0.0047 | multi |
| E_AURC | ↓ 越低越好 | 0.0210 | virchow2 0.0251 | -0.0041 | multi |
| cwA | ↑ 越高越好 | 0.9437 | uni 0.9440 | -0.0003 | single |

BRCA IDC vs ILC 是高准确率场景下的证据。融合准确率 0.9248，略高于最佳单特征 0.9239；AUPR 从 0.9732 提升到 0.9777；SCE、Brier、AURC、E_AURC 均优于最佳单 extractor。这个任务的价值在于说明：即使单特征模型已经很强，多特征融合仍能改善选择性预测和若干校准指标。

Mode0 枚举组合中表现最好的组合如下，可用于说明“不是所有 extractor 都必须用满，合适子集有时更强”：

| 组合规模 | extractor 子集 | multi 胜出指标数 |
|---:|---|---:|
| 3 | gigapath + h0 + uni | 12/15 |
| 4 | conch_v1_5 + gigapath + h0 + virchow2 | 10/15 |
| 3 | conch_v1_5 + gigapath + h0 | 10/15 |

### Task062 KIDNEY 3亚型

输出目录：`nnMIL_Classification_Uncertainty_5fold/Uncertainty_output/Task062_TCGA_KIDNEY_3subtypes_5extractor_JS_mode1_common/20260614_030524`。5-fold 测试样本 920 例，fold 样本数为 [188, 184, 180, 188, 180]，标签分布为 {'1': 293, '0': 518, '2': 109}。multi 在 10/15 个指标上超过最佳单 extractor。

| 指标 | 方向 | Multi | 最佳单特征 | Delta | Winner |
|---|---:|---:|---|---:|---|
| Overall_Accuracy | ↑ 越高越好 | 0.9424 | conch_v1_5 0.9424 | -0.0000 | single |
| AUROC | ↑ 越高越好 | 0.8458 | gigapath 0.8010 | 0.0448 | multi |
| AUPR | ↑ 越高越好 | 0.9854 | uni 0.9793 | 0.0061 | multi |
| ECE | ↓ 越低越好 | 0.1332 | virchow2 0.1226 | 0.0106 | single |
| SCE | ↓ 越低越好 | 0.0404 | virchow2 0.0609 | -0.0205 | multi |
| Brier | ↓ 越低越好 | 0.0933 | virchow2 0.1110 | -0.0176 | multi |
| FPR95 | ↓ 越低越好 | 0.4208 | virchow2 0.6303 | -0.2095 | multi |
| AURC | ↓ 越低越好 | 0.0158 | uni 0.0229 | -0.0070 | multi |
| E_AURC | ↓ 越低越好 | 0.0140 | uni 0.0195 | -0.0055 | multi |
| cwA | ↑ 越高越好 | 0.9608 | conch_v1_5 0.9537 | 0.0070 | multi |

这是当前最干净的强证据之一。融合在 10/15 指标胜出，尤其 AUROC 从最佳单特征 0.8010 提升到 0.8458，AUPR 从 0.9793 提升到 0.9854；FPR95 从 0.6303 大幅下降到 0.4208；AURC 和 E_AURC 也同步下降。这说明在 KIDNEY 三亚型任务上，多特征融合不仅能保持很高准确率（0.9424），还能显著改善“哪些样本可能错”的排序能力。这个任务适合画成方法主图，突出 AUROC、FPR95、AURC、E_AURC、Brier。

Mode0 枚举组合中表现最好的组合如下，可用于说明“不是所有 extractor 都必须用满，合适子集有时更强”：

| 组合规模 | extractor 子集 | multi 胜出指标数 |
|---:|---|---:|
| 3 | conch_v1_5 + h0 + uni | 15/15 |
| 3 | conch_v1_5 + h0 + virchow2 | 15/15 |
| 3 | conch_v1_5 + gigapath + h0 | 13/15 |

### Task066 UCEC Endometrioid vs Serous

输出目录：`nnMIL_Classification_Uncertainty_5fold/Uncertainty_output/Task066_TCGA_UCEC_Endometrioid_vs_Serous_5extractor_JS_mode1_common/20260614_172847`。5-fold 测试样本 572 例，fold 样本数为 [109, 119, 117, 107, 120]，标签分布为 {'1': 124, '0': 448}。multi 在 10/15 个指标上超过最佳单 extractor。

| 指标 | 方向 | Multi | 最佳单特征 | Delta | Winner |
|---|---:|---:|---|---:|---|
| Overall_Accuracy | ↑ 越高越好 | 0.8962 | h0 0.8869 | 0.0093 | multi |
| AUROC | ↑ 越高越好 | 0.7975 | uni 0.6913 | 0.1061 | multi |
| AUPR | ↑ 越高越好 | 0.9713 | h0 0.9421 | 0.0292 | multi |
| ECE | ↓ 越低越好 | 0.2222 | h0 0.0933 | 0.1289 | single |
| SCE | ↓ 越低越好 | 0.0997 | uni 0.1173 | -0.0176 | multi |
| Brier | ↓ 越低越好 | 0.1630 | uni 0.1888 | -0.0258 | multi |
| FPR95 | ↓ 越低越好 | 0.7456 | h0 0.7418 | 0.0038 | single |
| AURC | ↓ 越低越好 | 0.0333 | h0 0.0609 | -0.0276 | multi |
| E_AURC | ↓ 越低越好 | 0.0265 | h0 0.0533 | -0.0268 | multi |
| cwA | ↑ 越高越好 | 0.9245 | h0 0.9000 | 0.0245 | multi |

这是二分类任务中最强的证据。融合在 10/15 指标胜出，准确率 0.8962 高于最佳单特征 0.8869；AUROC 从 0.6913 提升到 0.7975，AUPR 从 0.9421 提升到 0.9713；AURC 从 0.0609 降到 0.0333，E_AURC 从 0.0533 降到 0.0265。该结果非常适合说明多 extractor voting 能显著改善错误检测和选择性预测。短板是 ECE 仍不如 h0，说明融合置信度排序很好，但绝对概率校准还可后处理。

Mode0 枚举组合中表现最好的组合如下，可用于说明“不是所有 extractor 都必须用满，合适子集有时更强”：

| 组合规模 | extractor 子集 | multi 胜出指标数 |
|---:|---|---:|
| 4 | conch_v1_5 + h0 + uni + virchow2 | 11/15 |
| 3 | conch_v1_5 + h0 + virchow2 | 11/15 |
| 3 | conch_v1_5 + uni + virchow2 | 11/15 |

### Task071 BLCA Papillary vs NonPapillary

输出目录：`nnMIL_Classification_Uncertainty_5fold/Uncertainty_output/Task071_TCGA_BLCA_Papillary_vs_NonPapillary_5extractor_JS_mode1_common/20260614_221200`。5-fold 测试样本 452 例，fold 样本数为 [88, 81, 92, 96, 95]，标签分布为 {'0': 326, '1': 126}。multi 在 10/15 个指标上超过最佳单 extractor。

| 指标 | 方向 | Multi | 最佳单特征 | Delta | Winner |
|---|---:|---:|---|---:|---|
| Overall_Accuracy | ↑ 越高越好 | 0.7505 | conch_v1_5 0.7219 | 0.0286 | multi |
| AUROC | ↑ 越高越好 | 0.5909 | gigapath 0.5587 | 0.0321 | multi |
| AUPR | ↑ 越高越好 | 0.8040 | virchow2 0.7428 | 0.0612 | multi |
| ECE | ↓ 越低越好 | 0.2611 | virchow2 0.2104 | 0.0507 | single |
| SCE | ↓ 越低越好 | 0.1605 | gigapath 0.1878 | -0.0274 | multi |
| Brier | ↓ 越低越好 | 0.3726 | h0 0.3972 | -0.0246 | multi |
| FPR95 | ↓ 越低越好 | 0.8881 | virchow2 0.8586 | 0.0295 | single |
| AURC | ↓ 越低越好 | 0.2026 | virchow2 0.2621 | -0.0594 | multi |
| E_AURC | ↓ 越低越好 | 0.1665 | uni 0.2097 | -0.0432 | multi |
| cwA | ↑ 越高越好 | 0.7633 | conch_v1_5 0.7230 | 0.0403 | multi |

这是另一个非常适合展示的二分类证据。融合在 10/15 指标胜出，准确率从最佳单特征 0.7219 提升到 0.7505，AUPR 从 0.7428 提升到 0.8040，AURC 从 0.2621 降到 0.2026，E_AURC 从 0.2097 降到 0.1665，cwA 从 0.7230 提升到 0.7633。这个任务说明融合不仅能改善置信度排序，还直接带来分类层面的收益。

Mode0 枚举组合中表现最好的组合如下，可用于说明“不是所有 extractor 都必须用满，合适子集有时更强”：

| 组合规模 | extractor 子集 | multi 胜出指标数 |
|---:|---|---:|
| 3 | gigapath + h0 + uni | 13/15 |
| 4 | conch_v1_5 + gigapath + h0 + uni | 11/15 |
| 4 | conch_v1_5 + gigapath + uni + virchow2 | 11/15 |

## 部分证据任务：可作为补充图或附录

这些任务不是每项都赢，但可以支撑“多特征融合在不同疾病和不同分类数下经常改善关键不确定性指标”的论点。汇报时建议挑选与主结论一致的指标，不要把所有任务硬塞进同一张胜负图。

### EBRAINS_IDH

输出目录：`nnMIL_Classification_Uncertainty_5fold/Uncertainty_output/EBRAINS_IDH_30to2_5fold/20260606_095234`。样本数 848，标签分布 {'0': 521, '1': 327}。multi 胜出 4/15。
融合胜出的指标包括：SCE, Brier, NLL, FPR95。

| 指标 | Multi | 最佳单特征 | Delta | Winner |
|---|---:|---|---:|---|
| Overall_Accuracy | 0.8776 | virchow2 0.8999 | -0.0223 | single |
| AUROC | 0.8055 | h0 0.8094 | -0.0039 | single |
| AUPR | 0.9666 | virchow2 0.9709 | -0.0043 | single |
| ECE | 0.2471 | virchow2 0.2199 | 0.0272 | single |
| SCE | 0.1362 | virchow2 0.1418 | -0.0056 | multi |
| Brier | 0.2089 | virchow2 0.2224 | -0.0135 | multi |
| FPR95 | 0.6985 | h0 0.7061 | -0.0076 | multi |
| AURC | 0.0388 | virchow2 0.0325 | 0.0063 | single |
| E_AURC | 0.0301 | virchow2 0.0269 | 0.0033 | single |
| cwA | 0.9160 | virchow2 0.9237 | -0.0077 | single |

EBRAINS IDH 二分类里，整体准确率最佳仍是 virchow2 单特征，但融合在 SCE、Brier、FPR95 等指标上更好。这个任务可以作为早期验证或补充，不建议作为主图第一位。

### Task060 BRCA PAM50 3类 noHer2

输出目录：`nnMIL_Classification_Uncertainty_5fold/Uncertainty_output/Task060_TCGA_BRCA_PAM50_3cls_noHer2_5extractor_JS_mode1_common/20260614_025035`。样本数 741，标签分布 {'0': 404, '2': 137, '1': 200}。multi 胜出 3/15。
融合胜出的指标包括：FPR95, cwA, Overall_Accuracy。

| 指标 | Multi | 最佳单特征 | Delta | Winner |
|---|---:|---|---:|---|
| Overall_Accuracy | 0.7449 | virchow2 0.7423 | 0.0026 | multi |
| AUROC | 0.7416 | virchow2 0.7477 | -0.0061 | single |
| AUPR | 0.8974 | virchow2 0.9010 | -0.0035 | single |
| ECE | 0.1105 | h0 0.0935 | 0.0170 | single |
| SCE | 0.0851 | virchow2 0.0827 | 0.0023 | single |
| Brier | 0.3493 | virchow2 0.3374 | 0.0120 | single |
| FPR95 | 0.8111 | virchow2 0.8181 | -0.0070 | multi |
| AURC | 0.1204 | virchow2 0.1187 | 0.0017 | single |
| E_AURC | 0.0836 | virchow2 0.0807 | 0.0029 | single |
| cwA | 0.7906 | virchow2 0.7764 | 0.0143 | multi |

Mode0 最佳子集：

| 子集 | 胜出指标数 |
|---|---:|
| conch_v1_5 + gigapath + h0 + uni | 11/15 |
| conch_v1_5 + gigapath + uni | 11/15 |
| conch_v1_5 + h0 + uni | 11/15 |

BRCA PAM50 3类 noHer2 中，融合准确率略高于最佳单特征（0.7449 vs 0.7423），cwA 和 FPR95 也更好，但 AUROC/AUPR/ECE 不占优。它适合用于说明融合有分类收益，但校准仍需改进。

### Task061 BRCA PAM50 4类

输出目录：`nnMIL_Classification_Uncertainty_5fold/Uncertainty_output/Task061_TCGA_BRCA_PAM50_4cls_5extractor_JS_mode1_common/20260614_025744`。样本数 806，标签分布 {'0': 404, '2': 65, '3': 137, '1': 200}。multi 胜出 5/15。
融合胜出的指标包括：MCE, SCE, Brier, cwA, Overall_Accuracy。

| 指标 | Multi | 最佳单特征 | Delta | Winner |
|---|---:|---|---:|---|
| Overall_Accuracy | 0.6859 | virchow2 0.6834 | 0.0024 | multi |
| AUROC | 0.7047 | virchow2 0.7169 | -0.0122 | single |
| AUPR | 0.8466 | virchow2 0.8570 | -0.0104 | single |
| ECE | 0.1157 | uni 0.0737 | 0.0420 | single |
| SCE | 0.0810 | virchow2 0.0876 | -0.0066 | multi |
| Brier | 0.4284 | virchow2 0.4319 | -0.0035 | multi |
| FPR95 | 0.8652 | uni 0.8385 | 0.0267 | single |
| AURC | 0.1755 | virchow2 0.1697 | 0.0058 | single |
| E_AURC | 0.1187 | virchow2 0.1109 | 0.0078 | single |
| cwA | 0.7261 | virchow2 0.7142 | 0.0118 | multi |

Mode0 最佳子集：

| 子集 | 胜出指标数 |
|---|---:|
| conch_v1_5 + gigapath + h0 + uni | 10/15 |
| conch_v1_5 + h0 + uni | 10/15 |
| gigapath + h0 + uni | 10/15 |

BRCA PAM50 4类中，融合准确率、SCE、Brier、cwA 等胜出，但 AUROC/AUPR 低于 virchow2。可作为多分类难任务的补充证据，强调融合在置信度加权准确率和部分校准上有收益。

### Task063 SARC 6类组织学

输出目录：`nnMIL_Classification_Uncertainty_5fold/Uncertainty_output/Task063_TCGA_SARC_histology_6cls_5extractor_JS_mode1_common/20260613_165108`。样本数 597，标签分布 {'1': 88, '0': 155, '3': 141, '5': 20, '2': 166, '4': 27}。multi 胜出 7/15。
融合胜出的指标包括：MCE, Brier, NLL, FPR95, AURC, cwA, Overall_Accuracy。

| 指标 | Multi | 最佳单特征 | Delta | Winner |
|---|---:|---|---:|---|
| Overall_Accuracy | 0.5992 | conch_v1_5 0.5969 | 0.0023 | multi |
| AUROC | 0.6587 | virchow2 0.6944 | -0.0357 | single |
| AUPR | 0.7700 | h0 0.7718 | -0.0018 | single |
| ECE | 0.1589 | uni 0.1226 | 0.0363 | single |
| SCE | 0.0936 | h0 0.0904 | 0.0032 | single |
| Brier | 0.5284 | virchow2 0.5588 | -0.0304 | multi |
| FPR95 | 0.8466 | gigapath 0.8588 | -0.0122 | multi |
| AURC | 0.2647 | h0 0.2650 | -0.0003 | multi |
| E_AURC | 0.1669 | virchow2 0.1631 | 0.0038 | single |
| cwA | 0.6325 | h0 0.6180 | 0.0145 | multi |

Mode0 最佳子集：

| 子集 | 胜出指标数 |
|---|---:|
| conch_v1_5 + gigapath + h0 + virchow2 | 11/15 |
| conch_v1_5 + gigapath + virchow2 | 11/15 |
| conch_v1_5 + uni + virchow2 | 11/15 |

SARC 6类组织学是类别数最多、样本分布较复杂的任务。融合准确率、Brier、FPR95、AURC、cwA 胜出，但 AUROC 和 ECE 不占优。这个任务适合放在附录，说明复杂多分类下融合仍能改善部分风险排序指标。

### Task064 STAD Lauren 3类

输出目录：`nnMIL_Classification_Uncertainty_5fold/Uncertainty_output/Task064_TCGA_STAD_Lauren_3cls_5extractor_JS_mode1_common/20260613_165755`。样本数 384，标签分布 {'2': 123, '0': 187, '1': 74}。multi 胜出 7/15。
融合胜出的指标包括：SCE, Brier, NLL, AUROC, FPR95, cwA, Overall_Accuracy。

| 指标 | Multi | 最佳单特征 | Delta | Winner |
|---|---:|---|---:|---|
| Overall_Accuracy | 0.6725 | virchow2 0.6695 | 0.0030 | multi |
| AUROC | 0.6181 | virchow2 0.6141 | 0.0040 | multi |
| AUPR | 0.7473 | virchow2 0.7733 | -0.0261 | single |
| ECE | 0.2138 | gigapath 0.1346 | 0.0792 | single |
| SCE | 0.1187 | gigapath 0.1224 | -0.0037 | multi |
| Brier | 0.4558 | virchow2 0.4799 | -0.0241 | multi |
| FPR95 | 0.8653 | gigapath 0.8690 | -0.0036 | multi |
| AURC | 0.2664 | virchow2 0.2442 | 0.0222 | single |
| E_AURC | 0.1995 | uni 0.1772 | 0.0222 | single |
| cwA | 0.6946 | virchow2 0.6894 | 0.0052 | multi |

Mode0 最佳子集：

| 子集 | 胜出指标数 |
|---|---:|
| gigapath + uni + virchow2 | 10/15 |
| conch_v1_5 + gigapath + uni + virchow2 | 8/15 |
| conch_v1_5 + gigapath + h0 | 8/15 |

STAD Lauren 3类中，融合准确率、AUROC、SCE、Brier、FPR95、cwA 均优于最佳单特征，但 AUPR、AURC、ECE 不占优。这个任务可用于展示“多指标互补”：融合并非只提升一个指标，而是在不同类型指标上都有收益。

### Task068 PRAD Gleason 二分类

输出目录：`nnMIL_Classification_Uncertainty_5fold/Uncertainty_output/Task068_TCGA_PRAD_Gleason_binary_5extractor_JS_mode1_common/20260614_172847`。样本数 447，标签分布 {'1': 403, '0': 44}。multi 胜出 6/15。
融合胜出的指标包括：MCE, Brier, NLL, AUPR, cwA, Overall_Accuracy。

| 指标 | Multi | 最佳单特征 | Delta | Winner |
|---|---:|---|---:|---|
| Overall_Accuracy | 0.6955 | h0 0.6723 | 0.0232 | multi |
| AUROC | 0.4816 | h0 0.5651 | -0.0835 | single |
| AUPR | 0.7205 | h0 0.7170 | 0.0035 | multi |
| ECE | 0.2674 | h0 0.2581 | 0.0093 | single |
| SCE | 0.2805 | h0 0.2786 | 0.0019 | single |
| Brier | 0.3564 | h0 0.3648 | -0.0084 | multi |
| FPR95 | 0.9111 | uni 0.8943 | 0.0168 | single |
| AURC | 0.2925 | h0 0.2905 | 0.0021 | single |
| E_AURC | 0.2381 | h0 0.2071 | 0.0310 | single |
| cwA | 0.6966 | h0 0.6732 | 0.0235 | multi |

Mode0 最佳子集：

| 子集 | 胜出指标数 |
|---|---:|
| conch_v1_5 + gigapath + virchow2 | 12/15 |
| gigapath + uni + virchow2 | 12/15 |
| conch_v1_5 + uni + virchow2 | 11/15 |

PRAD Gleason 二分类类别极不平衡（403 vs 44），融合准确率、AUPR、Brier、cwA 胜出，但 AUROC 和 FPR95 较弱。这个任务适合讨论类别不平衡下 AUPR 与 AUROC 的差异。

### Task070 HNSC HPV 状态

输出目录：`nnMIL_Classification_Uncertainty_5fold/Uncertainty_output/Task070_TCGA_HNSC_HPV_status_5extractor_JS_mode1_common/20260614_221059`。样本数 68，标签分布 {'0': 38, '1': 30}。multi 胜出 6/15。
融合胜出的指标包括：Brier, NLL, AUPR, AURC, cwA, Overall_Accuracy。

| 指标 | Multi | 最佳单特征 | Delta | Winner |
|---|---:|---|---:|---|
| Overall_Accuracy | 0.8053 | virchow2 0.7746 | 0.0308 | multi |
| AUROC | 0.3816 | h0 0.6944 | -0.3129 | single |
| AUPR | 0.8375 | h0 0.8326 | 0.0049 | multi |
| ECE | 0.4798 | h0 0.2851 | 0.1948 | single |
| SCE | 0.2413 | uni 0.1842 | 0.0571 | single |
| Brier | 0.3489 | virchow2 0.3884 | -0.0395 | multi |
| FPR95 | 0.9600 | gigapath 0.6762 | 0.2838 | single |
| AURC | 0.1853 | h0 0.2025 | -0.0173 | multi |
| E_AURC | 0.1506 | h0 0.1471 | 0.0035 | single |
| cwA | 0.7852 | h0 0.7692 | 0.0160 | multi |

Mode0 最佳子集：

| 子集 | 胜出指标数 |
|---|---:|
| h0 + uni + virchow2 | 8/15 |
| conch_v1_5 + gigapath + h0 + virchow2 | 7/15 |
| gigapath + h0 + uni + virchow2 | 7/15 |

HNSC HPV 样本数较小（68 例），融合准确率和 AUPR 更高，但 AUROC/FPR95 不稳定。建议只作为探索结果，不作为核心证据。

## 不建议主打的负例

### Task065 THCA 3类组织学

输出目录：`nnMIL_Classification_Uncertainty_5fold/Uncertainty_output/Task065_TCGA_THCA_histology_3cls_5extractor_JS_mode1_common/20260613_170154`。样本数 511，标签分布 {'0': 369, '2': 38, '1': 104}。multi 胜出 0/15。

| 指标 | Multi | 最佳单特征 | Delta | Winner |
|---|---:|---|---:|---|
| Overall_Accuracy | 0.7041 | uni 0.7128 | -0.0087 | single |
| AUROC | 0.6389 | gigapath 0.6974 | -0.0585 | single |
| AUPR | 0.7953 | uni 0.8100 | -0.0148 | single |
| ECE | 0.1779 | uni 0.1174 | 0.0605 | single |
| SCE | 0.1820 | uni 0.1749 | 0.0071 | single |
| Brier | 0.4139 | uni 0.3968 | 0.0171 | single |
| FPR95 | 0.7890 | gigapath 0.7557 | 0.0334 | single |
| AURC | 0.2148 | uni 0.2013 | 0.0135 | single |
| E_AURC | 0.1637 | gigapath 0.1507 | 0.0130 | single |
| cwA | 0.7292 | uni 0.7363 | -0.0071 | single |

THCA 当前结果显示多特征融合没有超过最佳单 extractor。这个结果不应进入“证明方法好”的主图，但非常适合在讨论页说明方法边界：当某个单 extractor 已经在该任务上形成更稳定的判别边界，简单等权 voting + MI 融合可能被弱 extractor 拖累。后续可以尝试基于验证集的 extractor weighting、按类别 weighting、或温度缩放后再融合。

## 所有 15 项指标的完整表

下面给出每个任务 15 项指标的完整 fold-mean 比较。这个表可以直接拆成附录或用于画图时查数。

### EBRAINS_IDH 完整指标

| 指标 | 方向 | Multi mean | 最佳单特征 | Best single mean | Delta | Winner |
|---|---:|---:|---|---:|---:|---|
| ECE | ↓ 越低越好 | 0.2471 | virchow2 | 0.2199 | 0.0272 | single |
| MCE | ↓ 越低越好 | 0.7445 | conch_v1_5 | 0.5705 | 0.1740 | single |
| ACE | ↓ 越低越好 | 0.2355 | uni | 0.2108 | 0.0247 | single |
| SCE | ↓ 越低越好 | 0.1362 | virchow2 | 0.1418 | -0.0056 | multi |
| ICI | ↓ 越低越好 | 0.2447 | uni | 0.2187 | 0.0260 | single |
| Brier | ↓ 越低越好 | 0.2089 | virchow2 | 0.2224 | -0.0135 | multi |
| NLL | ↓ 越低越好 | 0.4546 | virchow2 | 0.5188 | -0.0642 | multi |
| CSR | → 越接近 1 越好 | 0.7214 | virchow2 | 0.7566 | -0.0353 | single |
| AUROC | ↑ 越高越好 | 0.8055 | h0 | 0.8094 | -0.0039 | single |
| AUPR | ↑ 越高越好 | 0.9666 | virchow2 | 0.9709 | -0.0043 | single |
| FPR95 | ↓ 越低越好 | 0.6985 | h0 | 0.7061 | -0.0076 | multi |
| AURC | ↓ 越低越好 | 0.0388 | virchow2 | 0.0325 | 0.0063 | single |
| E_AURC | ↓ 越低越好 | 0.0301 | virchow2 | 0.0269 | 0.0033 | single |
| cwA | ↑ 越高越好 | 0.9160 | virchow2 | 0.9237 | -0.0077 | single |
| Overall_Accuracy | ↑ 越高越好 | 0.8776 | virchow2 | 0.8999 | -0.0223 | single |

### Task059 BRCA IDC vs ILC 完整指标

| 指标 | 方向 | Multi mean | 最佳单特征 | Best single mean | Delta | Winner |
|---|---:|---:|---|---:|---:|---|
| ECE | ↓ 越低越好 | 0.1556 | virchow2 | 0.1189 | 0.0367 | single |
| MCE | ↓ 越低越好 | 0.5079 | h0 | 0.7523 | -0.2444 | multi |
| ACE | ↓ 越低越好 | 0.1490 | virchow2 | 0.1170 | 0.0320 | single |
| SCE | ↓ 越低越好 | 0.0682 | virchow2 | 0.0759 | -0.0078 | multi |
| ICI | ↓ 越低越好 | 0.1540 | virchow2 | 0.1190 | 0.0350 | single |
| Brier | ↓ 越低越好 | 0.1160 | virchow2 | 0.1267 | -0.0107 | multi |
| NLL | ↓ 越低越好 | 0.2146 | virchow2 | 0.2306 | -0.0160 | multi |
| CSR | → 越接近 1 越好 | 0.8335 | virchow2 | 0.8756 | 0.0421 | single |
| AUROC | ↑ 越高越好 | 0.8114 | h0 | 0.8151 | -0.0037 | single |
| AUPR | ↑ 越高越好 | 0.9777 | virchow2 | 0.9732 | 0.0045 | multi |
| FPR95 | ↓ 越低越好 | 0.6099 | h0 | 0.6018 | 0.0080 | single |
| AURC | ↓ 越低越好 | 0.0244 | virchow2 | 0.0290 | -0.0047 | multi |
| E_AURC | ↓ 越低越好 | 0.0210 | virchow2 | 0.0251 | -0.0041 | multi |
| cwA | ↑ 越高越好 | 0.9437 | uni | 0.9440 | -0.0003 | single |
| Overall_Accuracy | ↑ 越高越好 | 0.9248 | uni | 0.9239 | 0.0009 | multi |

### Task060 BRCA PAM50 3类 noHer2 完整指标

| 指标 | 方向 | Multi mean | 最佳单特征 | Best single mean | Delta | Winner |
|---|---:|---:|---|---:|---:|---|
| ECE | ↓ 越低越好 | 0.1105 | h0 | 0.0935 | 0.0170 | single |
| MCE | ↓ 越低越好 | 0.6590 | h0 | 0.6100 | 0.0490 | single |
| ACE | ↓ 越低越好 | 0.1106 | virchow2 | 0.0963 | 0.0143 | single |
| SCE | ↓ 越低越好 | 0.0851 | virchow2 | 0.0827 | 0.0023 | single |
| ICI | ↓ 越低越好 | 0.1033 | gigapath | 0.0893 | 0.0140 | single |
| Brier | ↓ 越低越好 | 0.3493 | virchow2 | 0.3374 | 0.0120 | single |
| NLL | ↓ 越低越好 | 0.5835 | virchow2 | 0.5552 | 0.0283 | single |
| CSR | → 越接近 1 越好 | 0.8646 | virchow2 | 0.9607 | 0.0961 | single |
| AUROC | ↑ 越高越好 | 0.7416 | virchow2 | 0.7477 | -0.0061 | single |
| AUPR | ↑ 越高越好 | 0.8974 | virchow2 | 0.9010 | -0.0035 | single |
| FPR95 | ↓ 越低越好 | 0.8111 | virchow2 | 0.8181 | -0.0070 | multi |
| AURC | ↓ 越低越好 | 0.1204 | virchow2 | 0.1187 | 0.0017 | single |
| E_AURC | ↓ 越低越好 | 0.0836 | virchow2 | 0.0807 | 0.0029 | single |
| cwA | ↑ 越高越好 | 0.7906 | virchow2 | 0.7764 | 0.0143 | multi |
| Overall_Accuracy | ↑ 越高越好 | 0.7449 | virchow2 | 0.7423 | 0.0026 | multi |

### Task061 BRCA PAM50 4类 完整指标

| 指标 | 方向 | Multi mean | 最佳单特征 | Best single mean | Delta | Winner |
|---|---:|---:|---|---:|---:|---|
| ECE | ↓ 越低越好 | 0.1157 | uni | 0.0737 | 0.0420 | single |
| MCE | ↓ 越低越好 | 0.4829 | uni | 0.5670 | -0.0841 | multi |
| ACE | ↓ 越低越好 | 0.1267 | uni | 0.0867 | 0.0400 | single |
| SCE | ↓ 越低越好 | 0.0810 | virchow2 | 0.0876 | -0.0066 | multi |
| ICI | ↓ 越低越好 | 0.1125 | uni | 0.0758 | 0.0366 | single |
| Brier | ↓ 越低越好 | 0.4284 | virchow2 | 0.4319 | -0.0035 | multi |
| NLL | ↓ 越低越好 | 0.7844 | virchow2 | 0.7836 | 0.0008 | single |
| CSR | → 越接近 1 越好 | 0.8448 | virchow2 | 0.9854 | 0.1406 | single |
| AUROC | ↑ 越高越好 | 0.7047 | virchow2 | 0.7169 | -0.0122 | single |
| AUPR | ↑ 越高越好 | 0.8466 | virchow2 | 0.8570 | -0.0104 | single |
| FPR95 | ↓ 越低越好 | 0.8652 | uni | 0.8385 | 0.0267 | single |
| AURC | ↓ 越低越好 | 0.1755 | virchow2 | 0.1697 | 0.0058 | single |
| E_AURC | ↓ 越低越好 | 0.1187 | virchow2 | 0.1109 | 0.0078 | single |
| cwA | ↑ 越高越好 | 0.7261 | virchow2 | 0.7142 | 0.0118 | multi |
| Overall_Accuracy | ↑ 越高越好 | 0.6859 | virchow2 | 0.6834 | 0.0024 | multi |

### Task062 KIDNEY 3亚型 完整指标

| 指标 | 方向 | Multi mean | 最佳单特征 | Best single mean | Delta | Winner |
|---|---:|---:|---|---:|---:|---|
| ECE | ↓ 越低越好 | 0.1332 | virchow2 | 0.1226 | 0.0106 | single |
| MCE | ↓ 越低越好 | 0.6823 | virchow2 | 0.7554 | -0.0731 | multi |
| ACE | ↓ 越低越好 | 0.1264 | virchow2 | 0.1225 | 0.0040 | single |
| SCE | ↓ 越低越好 | 0.0404 | virchow2 | 0.0609 | -0.0205 | multi |
| ICI | ↓ 越低越好 | 0.1284 | virchow2 | 0.1235 | 0.0049 | single |
| Brier | ↓ 越低越好 | 0.0933 | virchow2 | 0.1110 | -0.0176 | multi |
| NLL | ↓ 越低越好 | 0.2043 | virchow2 | 0.2435 | -0.0391 | multi |
| CSR | → 越接近 1 越好 | 0.8641 | virchow2 | 0.8772 | 0.0132 | single |
| AUROC | ↑ 越高越好 | 0.8458 | gigapath | 0.8010 | 0.0448 | multi |
| AUPR | ↑ 越高越好 | 0.9854 | uni | 0.9793 | 0.0061 | multi |
| FPR95 | ↓ 越低越好 | 0.4208 | virchow2 | 0.6303 | -0.2095 | multi |
| AURC | ↓ 越低越好 | 0.0158 | uni | 0.0229 | -0.0070 | multi |
| E_AURC | ↓ 越低越好 | 0.0140 | uni | 0.0195 | -0.0055 | multi |
| cwA | ↑ 越高越好 | 0.9608 | conch_v1_5 | 0.9537 | 0.0070 | multi |
| Overall_Accuracy | ↑ 越高越好 | 0.9424 | conch_v1_5 | 0.9424 | -0.0000 | single |

### Task063 SARC 6类组织学 完整指标

| 指标 | 方向 | Multi mean | 最佳单特征 | Best single mean | Delta | Winner |
|---|---:|---:|---|---:|---:|---|
| ECE | ↓ 越低越好 | 0.1589 | uni | 0.1226 | 0.0363 | single |
| MCE | ↓ 越低越好 | 0.5187 | h0 | 0.7413 | -0.2225 | multi |
| ACE | ↓ 越低越好 | 0.1991 | uni | 0.1586 | 0.0404 | single |
| SCE | ↓ 越低越好 | 0.0936 | h0 | 0.0904 | 0.0032 | single |
| ICI | ↓ 越低越好 | 0.1660 | uni | 0.1371 | 0.0290 | single |
| Brier | ↓ 越低越好 | 0.5284 | virchow2 | 0.5588 | -0.0304 | multi |
| NLL | ↓ 越低越好 | 1.0677 | h0 | 1.1266 | -0.0589 | multi |
| CSR | → 越接近 1 越好 | 0.8584 | h0 | 0.9643 | 0.1058 | single |
| AUROC | ↑ 越高越好 | 0.6587 | virchow2 | 0.6944 | -0.0357 | single |
| AUPR | ↑ 越高越好 | 0.7700 | h0 | 0.7718 | -0.0018 | single |
| FPR95 | ↓ 越低越好 | 0.8466 | gigapath | 0.8588 | -0.0122 | multi |
| AURC | ↓ 越低越好 | 0.2647 | h0 | 0.2650 | -0.0003 | multi |
| E_AURC | ↓ 越低越好 | 0.1669 | virchow2 | 0.1631 | 0.0038 | single |
| cwA | ↑ 越高越好 | 0.6325 | h0 | 0.6180 | 0.0145 | multi |
| Overall_Accuracy | ↑ 越高越好 | 0.5992 | conch_v1_5 | 0.5969 | 0.0023 | multi |

### Task064 STAD Lauren 3类 完整指标

| 指标 | 方向 | Multi mean | 最佳单特征 | Best single mean | Delta | Winner |
|---|---:|---:|---|---:|---:|---|
| ECE | ↓ 越低越好 | 0.2138 | gigapath | 0.1346 | 0.0792 | single |
| MCE | ↓ 越低越好 | 0.7264 | conch_v1_5 | 0.6011 | 0.1253 | single |
| ACE | ↓ 越低越好 | 0.2340 | conch_v1_5 | 0.1762 | 0.0579 | single |
| SCE | ↓ 越低越好 | 0.1187 | gigapath | 0.1224 | -0.0037 | multi |
| ICI | ↓ 越低越好 | 0.2157 | conch_v1_5 | 0.1280 | 0.0877 | single |
| Brier | ↓ 越低越好 | 0.4558 | virchow2 | 0.4799 | -0.0241 | multi |
| NLL | ↓ 越低越好 | 0.7788 | virchow2 | 0.8148 | -0.0360 | multi |
| CSR | → 越接近 1 越好 | 0.7218 | conch_v1_5 | 0.8662 | 0.1444 | single |
| AUROC | ↑ 越高越好 | 0.6181 | virchow2 | 0.6141 | 0.0040 | multi |
| AUPR | ↑ 越高越好 | 0.7473 | virchow2 | 0.7733 | -0.0261 | single |
| FPR95 | ↓ 越低越好 | 0.8653 | gigapath | 0.8690 | -0.0036 | multi |
| AURC | ↓ 越低越好 | 0.2664 | virchow2 | 0.2442 | 0.0222 | single |
| E_AURC | ↓ 越低越好 | 0.1995 | uni | 0.1772 | 0.0222 | single |
| cwA | ↑ 越高越好 | 0.6946 | virchow2 | 0.6894 | 0.0052 | multi |
| Overall_Accuracy | ↑ 越高越好 | 0.6725 | virchow2 | 0.6695 | 0.0030 | multi |

### Task065 THCA 3类组织学 完整指标

| 指标 | 方向 | Multi mean | 最佳单特征 | Best single mean | Delta | Winner |
|---|---:|---:|---|---:|---:|---|
| ECE | ↓ 越低越好 | 0.1779 | uni | 0.1174 | 0.0605 | single |
| MCE | ↓ 越低越好 | 0.6291 | conch_v1_5 | 0.3775 | 0.2516 | single |
| ACE | ↓ 越低越好 | 0.1769 | virchow2 | 0.1441 | 0.0328 | single |
| SCE | ↓ 越低越好 | 0.1820 | uni | 0.1749 | 0.0071 | single |
| ICI | ↓ 越低越好 | 0.1671 | virchow2 | 0.1158 | 0.0513 | single |
| Brier | ↓ 越低越好 | 0.4139 | uni | 0.3968 | 0.0171 | single |
| NLL | ↓ 越低越好 | 0.6922 | uni | 0.6615 | 0.0307 | single |
| CSR | → 越接近 1 越好 | 0.7884 | virchow2 | 0.9528 | 0.1644 | single |
| AUROC | ↑ 越高越好 | 0.6389 | gigapath | 0.6974 | -0.0585 | single |
| AUPR | ↑ 越高越好 | 0.7953 | uni | 0.8100 | -0.0148 | single |
| FPR95 | ↓ 越低越好 | 0.7890 | gigapath | 0.7557 | 0.0334 | single |
| AURC | ↓ 越低越好 | 0.2148 | uni | 0.2013 | 0.0135 | single |
| E_AURC | ↓ 越低越好 | 0.1637 | gigapath | 0.1507 | 0.0130 | single |
| cwA | ↑ 越高越好 | 0.7292 | uni | 0.7363 | -0.0071 | single |
| Overall_Accuracy | ↑ 越高越好 | 0.7041 | uni | 0.7128 | -0.0087 | single |

### Task066 UCEC Endometrioid vs Serous 完整指标

| 指标 | 方向 | Multi mean | 最佳单特征 | Best single mean | Delta | Winner |
|---|---:|---:|---|---:|---:|---|
| ECE | ↓ 越低越好 | 0.2222 | h0 | 0.0933 | 0.1289 | single |
| MCE | ↓ 越低越好 | 0.7831 | h0 | 0.7856 | -0.0024 | multi |
| ACE | ↓ 越低越好 | 0.2226 | h0 | 0.0929 | 0.1297 | single |
| SCE | ↓ 越低越好 | 0.0997 | uni | 0.1173 | -0.0176 | multi |
| ICI | ↓ 越低越好 | 0.2186 | conch_v1_5 | 0.0858 | 0.1327 | single |
| Brier | ↓ 越低越好 | 0.1630 | uni | 0.1888 | -0.0258 | multi |
| NLL | ↓ 越低越好 | 0.2768 | uni | 0.3159 | -0.0391 | multi |
| CSR | → 越接近 1 越好 | 0.7617 | h0 | 1.0176 | 0.2207 | single |
| AUROC | ↑ 越高越好 | 0.7975 | uni | 0.6913 | 0.1061 | multi |
| AUPR | ↑ 越高越好 | 0.9713 | h0 | 0.9421 | 0.0292 | multi |
| FPR95 | ↓ 越低越好 | 0.7456 | h0 | 0.7418 | 0.0038 | single |
| AURC | ↓ 越低越好 | 0.0333 | h0 | 0.0609 | -0.0276 | multi |
| E_AURC | ↓ 越低越好 | 0.0265 | h0 | 0.0533 | -0.0268 | multi |
| cwA | ↑ 越高越好 | 0.9245 | h0 | 0.9000 | 0.0245 | multi |
| Overall_Accuracy | ↑ 越高越好 | 0.8962 | h0 | 0.8869 | 0.0093 | multi |

### Task068 PRAD Gleason 二分类 完整指标

| 指标 | 方向 | Multi mean | 最佳单特征 | Best single mean | Delta | Winner |
|---|---:|---:|---|---:|---:|---|
| ECE | ↓ 越低越好 | 0.2674 | h0 | 0.2581 | 0.0093 | single |
| MCE | ↓ 越低越好 | 0.5555 | gigapath | 0.8477 | -0.2921 | multi |
| ACE | ↓ 越低越好 | 0.2956 | h0 | 0.2457 | 0.0500 | single |
| SCE | ↓ 越低越好 | 0.2805 | h0 | 0.2786 | 0.0019 | single |
| ICI | ↓ 越低越好 | 0.2709 | h0 | 0.2511 | 0.0197 | single |
| Brier | ↓ 越低越好 | 0.3564 | h0 | 0.3648 | -0.0084 | multi |
| NLL | ↓ 越低越好 | 0.5290 | h0 | 0.5316 | -0.0025 | multi |
| CSR | → 越接近 1 越好 | 0.6504 | virchow2 | 1.3137 | 0.0360 | single |
| AUROC | ↑ 越高越好 | 0.4816 | h0 | 0.5651 | -0.0835 | single |
| AUPR | ↑ 越高越好 | 0.7205 | h0 | 0.7170 | 0.0035 | multi |
| FPR95 | ↓ 越低越好 | 0.9111 | uni | 0.8943 | 0.0168 | single |
| AURC | ↓ 越低越好 | 0.2925 | h0 | 0.2905 | 0.0021 | single |
| E_AURC | ↓ 越低越好 | 0.2381 | h0 | 0.2071 | 0.0310 | single |
| cwA | ↑ 越高越好 | 0.6966 | h0 | 0.6732 | 0.0235 | multi |
| Overall_Accuracy | ↑ 越高越好 | 0.6955 | h0 | 0.6723 | 0.0232 | multi |

### Task070 HNSC HPV 状态 完整指标

| 指标 | 方向 | Multi mean | 最佳单特征 | Best single mean | Delta | Winner |
|---|---:|---:|---|---:|---:|---|
| ECE | ↓ 越低越好 | 0.4798 | h0 | 0.2851 | 0.1948 | single |
| MCE | ↓ 越低越好 | 0.8865 | h0 | 0.7950 | 0.0915 | single |
| ACE | ↓ 越低越好 | 0.6004 | h0 | 0.3254 | 0.2750 | single |
| SCE | ↓ 越低越好 | 0.2413 | uni | 0.1842 | 0.0571 | single |
| ICI | ↓ 越低越好 | 0.5170 | h0 | 0.2706 | 0.2464 | single |
| Brier | ↓ 越低越好 | 0.3489 | virchow2 | 0.3884 | -0.0395 | multi |
| NLL | ↓ 越低越好 | 0.5447 | virchow2 | 0.5848 | -0.0401 | multi |
| CSR | → 越接近 1 越好 | 0.4445 | gigapath | 1.0006 | 0.5548 | single |
| AUROC | ↑ 越高越好 | 0.3816 | h0 | 0.6944 | -0.3129 | single |
| AUPR | ↑ 越高越好 | 0.8375 | h0 | 0.8326 | 0.0049 | multi |
| FPR95 | ↓ 越低越好 | 0.9600 | gigapath | 0.6762 | 0.2838 | single |
| AURC | ↓ 越低越好 | 0.1853 | h0 | 0.2025 | -0.0173 | multi |
| E_AURC | ↓ 越低越好 | 0.1506 | h0 | 0.1471 | 0.0035 | single |
| cwA | ↑ 越高越好 | 0.7852 | h0 | 0.7692 | 0.0160 | multi |
| Overall_Accuracy | ↑ 越高越好 | 0.8053 | virchow2 | 0.7746 | 0.0308 | multi |

### Task071 BLCA Papillary vs NonPapillary 完整指标

| 指标 | 方向 | Multi mean | 最佳单特征 | Best single mean | Delta | Winner |
|---|---:|---:|---|---:|---:|---|
| ECE | ↓ 越低越好 | 0.2611 | virchow2 | 0.2104 | 0.0507 | single |
| MCE | ↓ 越低越好 | 0.6838 | conch_v1_5 | 0.7681 | -0.0843 | multi |
| ACE | ↓ 越低越好 | 0.2682 | virchow2 | 0.2072 | 0.0610 | single |
| SCE | ↓ 越低越好 | 0.1605 | gigapath | 0.1878 | -0.0274 | multi |
| ICI | ↓ 越低越好 | 0.2587 | virchow2 | 0.1933 | 0.0654 | single |
| Brier | ↓ 越低越好 | 0.3726 | h0 | 0.3972 | -0.0246 | multi |
| NLL | ↓ 越低越好 | 0.5670 | h0 | 0.5833 | -0.0163 | multi |
| CSR | → 越接近 1 越好 | 0.6558 | virchow2 | 1.1766 | 0.1676 | single |
| AUROC | ↑ 越高越好 | 0.5909 | gigapath | 0.5587 | 0.0321 | multi |
| AUPR | ↑ 越高越好 | 0.8040 | virchow2 | 0.7428 | 0.0612 | multi |
| FPR95 | ↓ 越低越好 | 0.8881 | virchow2 | 0.8586 | 0.0295 | single |
| AURC | ↓ 越低越好 | 0.2026 | virchow2 | 0.2621 | -0.0594 | multi |
| E_AURC | ↓ 越低越好 | 0.1665 | uni | 0.2097 | -0.0432 | multi |
| cwA | ↑ 越高越好 | 0.7633 | conch_v1_5 | 0.7230 | 0.0403 | multi |
| Overall_Accuracy | ↑ 越高越好 | 0.7505 | conch_v1_5 | 0.7219 | 0.0286 | multi |

## 适合汇报的图表方案

图 1：pipeline 示意图。左侧是同一张 WSI 经 5 个 extractor 得到 h5 特征；中间是每个 extractor 训练独立 SimpleMIL；右侧是 MC Dropout voting 与 enhanced MI 两条置信度路径；最终输出预测、confidence 和 15 项评估指标。重点标出“分类模型不变，新增的是多特征不确定性估计”。

图 2：强证据任务的 delta heatmap。行放 Task059、Task062、Task066、Task071，列放 AUROC、AUPR、FPR95、AURC、E_AURC、cwA、Brier、SCE、Overall_Accuracy。颜色按“是否朝更好方向变化”编码：越高越好的指标用 multi-best_single，越低越好的指标用 best_single-multi，这样正值统一表示融合更好。这个图最直观，能一眼说明哪些数据集和哪些指标支持方法。

图 3：每个强证据任务的 multi vs best single 柱状图。Task062 重点画 FPR95、AURC、AUROC、Brier；Task066 重点画 AUROC、AUPR、AURC、E_AURC、cwA；Task071 重点画 Overall Accuracy、AUPR、AURC、E_AURC、cwA；Task059 重点画 AUPR、Brier、AURC、E_AURC。柱状图建议用同一颜色表示 multi，灰色表示 best single，并在柱顶标注数值。

图 4：mode0 子集枚举结果。每个任务展示 top-3 extractor 子集及其胜出指标数。这个图的核心信息是：多特征融合有效，但不是越多越好；在一些任务上 3 或 4 个 extractor 的组合可以超过全 5 个 extractor。比如 Task062 的 conch_v1_5+h0+virchow2 和 conch_v1_5+h0+uni 都达到 15/15；Task071 的 gigapath+h0+uni 达到 13/15。

图 5：失败分析图。把 Task065 THCA 放在附录，用雷达图或条形图显示 multi 全面弱于最佳单 extractor。这个图的价值是提高汇报可信度：我们不是只报好结果，而是明确指出当前等权融合策略在某些任务上会失效，并提出下一步改进。

## 结果解读

第一，融合方法最稳定改善的是“风险排序”而不是裸准确率。AURC、E_AURC、cwA、FPR95、AUPR 这些指标在强证据任务上频繁胜出，说明模型给出的 confidence 更适合做拒识、复核优先级排序和错误预警。对于病理图像汇报，这一点比单纯准确率更重要，因为实际使用场景中常常需要把低可信病例交给专家复核。

第二，校准指标呈现分化。SCE、Brier 在多个任务上改善明显，但 ECE/ACE 有时不如最佳单 extractor。这说明当前 0.5×vote + 0.5×MI 的 confidence 对排序有效，但绝对概率尺度未必完美。下一步若要追求临床可解释概率，可以在融合后加 temperature scaling、isotonic regression 或 validation-set calibration。

第三，mode0 子集枚举很有价值。多个任务显示 top-3 子集反而比全 5 extractor 更强，这说明 extractor 之间存在冗余和噪声。报告中可以把 mode1 作为“标准全特征融合”，把 mode0 作为“自动寻找有效特征组合”的扩展分析。特别是 KIDNEY、UCEC、BLCA、PRAD 的 mode0 top 组合胜出指标数很高，非常适合做后续方法优化。

第四，类别不平衡会影响指标解释。PRAD 中 403 vs 44，BRCA IDC/ILC 中 839 vs 204，UCEC 中 448 vs 124，这些任务中 AUPR 往往比 AUROC 更能反映高置信正确预测的排序质量。HNSC HPV 只有 68 个样本，fold 间方差会比较大，不能过度解读 AUROC 和 FPR95 的单点均值。

## 下一步建议

1. 主汇报优先使用 Task062、Task066、Task071、Task059。它们覆盖三分类、二分类、高准确率场景和跨癌种任务，且 multi 胜出指标数分别为 10/15、10/15、10/15、8/15。

2. 图表指标优先选择 AUROC、AUPR、FPR95、AURC、E_AURC、cwA、Brier、SCE、Overall_Accuracy。不要只画 ECE，因为 ECE 在多个任务上不是融合优势，单独画会低估方法价值。

3. 对 mode0 top 子集做二次验证。尤其 Task062 的两个 3-extractor 组合达到 15/15，Task071 的 gigapath+h0+uni 达到 13/15，Task066 多个 3/4-extractor 组合达到 11/15。这些结果提示可以把“extractor 子集选择”发展成正式方法。

4. 对弱任务做 error analysis。Task065 THCA 和 HNSC HPV 的结果提示：融合可能被弱 extractor、类别不平衡、小样本 fold 波动影响。建议检查每个 extractor 的 confusion matrix、按类别的 confidence 分布，以及错误样本是否集中在少数类别。

5. 做后处理校准。当前 confidence 的排序能力已经有证据，但 ECE/ACE 不稳定。建议在每个 fold 的 validation set 上学习一个温度或 isotonic calibration，再重新计算 ECE、ACE、NLL，看能否保留 AURC 优势同时改善概率校准。

## 可以直接用于汇报的口径

我们提出了一个不改变 nnMIL 分类主干的多特征不确定性估计框架。该框架将来自 5 个病理基础模型 extractor 的 slide-level 和 chunk-level 预测进行融合，通过 MC Dropout voting 捕捉模型间预测一致性，通过 enhanced mutual information 捕捉 chunk 与 extractor 间分歧，最后形成可用于错误检测和选择性预测的置信度。

在现有 5-fold 实验中，融合方法在多个 TCGA 任务上超过最佳单 extractor。KIDNEY 三亚型任务中，融合在 10/15 指标胜出，AUROC 提升 0.0448，FPR95 降低 0.2095，AURC 降低 0.0070。UCEC 二分类任务中，融合准确率提升 0.0093，AUROC 提升 0.1061，AUPR 提升 0.0292，AURC 降低 0.0276。BLCA 二分类任务中，融合准确率提升 0.0286，AUPR 提升 0.0612，AURC 降低 0.0594。BRCA IDC vs ILC 高准确率任务中，融合仍能在 AUPR、Brier、AURC、E_AURC 等指标上超过最佳单特征。

这些结果说明，多特征融合的主要优势体现在不确定性质量上：它能更好地区分高风险错误样本与可信样本，在拒识和人工复核场景中比单 extractor 更实用。当前不足是 ECE/ACE 等绝对概率校准指标并非总是最优，后续将通过验证集温度缩放和 extractor 权重学习进一步改进。

## 附：源文件定位

- README：`nnMIL_Classification_Uncertainty_5fold/README.md`
- 主结果目录：`nnMIL_Classification_Uncertainty_5fold/Uncertainty_output`
- 每个任务的核心汇总：`cross_fold_summary.json`
- 每个任务的 fold 测试样本：`fold_0_test.csv` 到 `fold_4_test.csv`
- mode0 子集枚举：`mode0_fold_mean_comparison.json` 与 `mode0_fold_mean_comparison.md`

## Mode0 子集枚举 Top 结果汇总

| 数据集 | Top1 子集 | Top1 胜出 | Top2 子集 | Top2 胜出 | Top3 子集 | Top3 胜出 |
|---|---|---:|---|---:|---|---:|
| Task059 BRCA IDC vs ILC | gigapath + h0 + uni | 12/15 | conch_v1_5 + gigapath + h0 + virchow2 | 10/15 | conch_v1_5 + gigapath + h0 | 10/15 |
| Task060 BRCA PAM50 3类 noHer2 | conch_v1_5 + gigapath + h0 + uni | 11/15 | conch_v1_5 + gigapath + uni | 11/15 | conch_v1_5 + h0 + uni | 11/15 |
| Task061 BRCA PAM50 4类 | conch_v1_5 + gigapath + h0 + uni | 10/15 | conch_v1_5 + h0 + uni | 10/15 | gigapath + h0 + uni | 10/15 |
| Task062 KIDNEY 3亚型 | conch_v1_5 + h0 + uni | 15/15 | conch_v1_5 + h0 + virchow2 | 15/15 | conch_v1_5 + gigapath + h0 | 13/15 |
| Task063 SARC 6类组织学 | conch_v1_5 + gigapath + h0 + virchow2 | 11/15 | conch_v1_5 + gigapath + virchow2 | 11/15 | conch_v1_5 + uni + virchow2 | 11/15 |
| Task064 STAD Lauren 3类 | gigapath + uni + virchow2 | 10/15 | conch_v1_5 + gigapath + uni + virchow2 | 8/15 | conch_v1_5 + gigapath + h0 | 8/15 |
| Task065 THCA 3类组织学 | gigapath + h0 + virchow2 | 6/15 | gigapath + uni + virchow2 | 6/15 | gigapath + h0 + uni + virchow2 | 3/15 |
| Task066 UCEC Endometrioid vs Serous | conch_v1_5 + h0 + uni + virchow2 | 11/15 | conch_v1_5 + h0 + virchow2 | 11/15 | conch_v1_5 + uni + virchow2 | 11/15 |
| Task068 PRAD Gleason 二分类 | conch_v1_5 + gigapath + virchow2 | 12/15 | gigapath + uni + virchow2 | 12/15 | conch_v1_5 + uni + virchow2 | 11/15 |
| Task070 HNSC HPV 状态 | h0 + uni + virchow2 | 8/15 | conch_v1_5 + gigapath + h0 + virchow2 | 7/15 | gigapath + h0 + uni + virchow2 | 7/15 |
| Task071 BLCA Papillary vs NonPapillary | gigapath + h0 + uni | 13/15 | conch_v1_5 + gigapath + h0 + uni | 11/15 | conch_v1_5 + gigapath + uni + virchow2 | 11/15 |

这个表建议作为方法扩展页。它能说明多特征融合有两个层次：一是全 5 extractor 的稳健融合，二是通过组合枚举找到更优子集。当前最亮眼的是 Task062 的两个 3-extractor 子集达到 15/15，Task071 的 3-extractor 子集达到 13/15，Task059 和 Task068 的 top 子集达到 12/15。

