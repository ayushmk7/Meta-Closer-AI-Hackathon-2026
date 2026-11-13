# CG params grid: 20261113T032906Z_pool_sf_city_grid

Center cell, selection seeds 0-9, world=truth, real cg_matching=True, Laya fake (render_state hash). Current params: {'matching.fillToMax': False, 'matching.reunionBoost': 0.0, 'matching.crowdBoost': 0.0}. params.yaml unchanged. **Exploratory, fake Laya: not evidence.** Confirm with real Laya tables (or `--world truth`) before a params PR.

Baselines: greedy isolated 66.4% [64.0%, 68.9%]; CG at current params 73.1% [70.6%, 75.6%].

| fillToMax | reunionBoost | crowdBoost | CG isolated w8 | CG - greedy isolated | fill vs CG current | fill vs greedy | passes |
|---|---|---|---|---|---|---|---|
| true | 1 | 0.5 | 66.5% [64.4%, 68.7%] | +0.1% [-1.5%, +1.7%] | -2.2% [-2.7%, -1.7%] | -5.2% [-5.7%, -4.8%] | no |
| false | 1 | 0.5 | 67.1% [64.9%, 69.4%] | +0.7% [-1.5%, +3.0%] | -2.4% [-2.9%, -1.8%] | -5.4% [-5.9%, -4.9%] | no |
| false | 4 | 0.5 | 67.3% [65.3%, 69.4%] | +0.9% [-0.8%, +2.6%] | -2.8% [-3.4%, -2.2%] | -5.8% [-6.3%, -5.3%] | no |
| true | 4 | 0.5 | 67.7% [65.1%, 70.2%] | +1.2% [+0.1%, +2.4%] | -2.6% [-2.9%, -2.2%] | -5.6% [-6.0%, -5.3%] | no |
| false | 4 | 0 | 68.9% [66.6%, 71.2%] | +2.4% [+0.5%, +4.4%] | -0.8% [-1.3%, -0.3%] | -3.9% [-4.2%, -3.5%] | no |
| false | 1 | 0 | 69.4% [67.4%, 71.4%] | +3.0% [+1.8%, +4.1%] | -0.3% [-0.9%, +0.3%] | -3.3% [-3.6%, -3.0%] | no |
| true | 1 | 0 | 69.5% [67.0%, 72.0%] | +3.1% [+1.0%, +5.1%] | -0.2% [-0.6%, +0.2%] | -3.3% [-3.6%, -2.9%] | no |
| true | 4 | 0 | 69.5% [67.3%, 71.7%] | +3.1% [+2.0%, +4.1%] | -0.6% [-1.0%, -0.1%] | -3.6% [-3.9%, -3.3%] | no |
| true | 0 | 0.5 | 71.4% [68.0%, 74.8%] | +5.0% [+2.7%, +7.3%] | -2.4% [-2.9%, -1.9%] | -5.4% [-5.9%, -5.0%] | no |
| false | 0 | 0.5 | 71.6% [67.9%, 75.3%] | +5.2% [+3.0%, +7.4%] | -2.5% [-3.0%, -2.0%] | -5.6% [-6.1%, -5.1%] | no |
| true | 0 | 0 | 71.8% [68.3%, 75.4%] | +5.4% [+2.6%, +8.2%] | +0.2% [+0.1%, +0.3%] | -2.9% [-3.2%, -2.5%] | no |
| false | 0 | 0 | 73.1% [70.6%, 75.6%] | +6.6% [+4.5%, +8.8%] | +0.0% [+0.0%, +0.0%] | -3.1% [-3.4%, -2.7%] | no |

## Held-out (seeds 10-59, center cell, top 2 from selection)

| fillToMax | reunionBoost | crowdBoost | CG isolated w8 | CG - greedy isolated | fill vs CG current | fill vs greedy | passes |
|---|---|---|---|---|---|---|---|
| true | 1 | 0.5 | 70.2% [69.3%, 71.2%] | +4.1% [+3.0%, +5.2%] | -2.6% [-2.8%, -2.4%] | -5.4% [-5.7%, -5.1%] | no |
| false | 1 | 0.5 | 70.4% [69.4%, 71.4%] | +4.3% [+3.2%, +5.3%] | -2.7% [-2.9%, -2.5%] | -5.6% [-5.9%, -5.3%] | no |
