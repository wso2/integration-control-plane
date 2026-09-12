# Architecture Guide

## Connections

```
Browser -> ICP-AUTH/HB:9445
Browser -> ICP-GraphQL:9446
Browser -> ICP-OBS:9448
Ballerina Integrator -> ICP-AUTH/HB:9445
Micro Integrator -> ICP-AUTH/HB:9445
ICP-AUTH/HB -> ICP-AUTH-ADPT:9447
ICP-OBS -> ICP-OBS-ADPT:9449
ICP-GraphQL -> Micro Integrator:9164
ICP-AUTH/HB -> DB:5432
ICP-GraphQL -> DB:5432
ICP-AUTH-ADPT -> DB:5432
ICP-OBS-ADPT -> OpenSearch:9200
```
