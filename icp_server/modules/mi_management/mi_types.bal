// Copyright (c) 2026, WSO2 Inc. (http://www.wso2.org) All Rights Reserved.
//
// WSO2 Inc. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at
//
//  http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.

// The management API's own shapes, as far as this module projects them. They stay private:
// what leaves here is the ICP's schema, so MI's payloads are never the console's contract.

type MgmtRegistryFileItem record {
    string name;
    string mediaType;
    MgmtRegistryProperty[] properties;
};

type MgmtRegistryDirectoryResponse record {
    int count;
    MgmtRegistryFileItem[] list;
};

type MgmtRegistryProperty record {
    string name;
    string value;
};

type MgmtRegistryMetadataResponse record {
    string name;
    string mediaType;
};

type MgmtRegistryPropertiesResponse record {
    int count;
    MgmtRegistryProperty[] list;
};

// Composite apps and data services report a fault the same way, under different names for
// the thing that faulted — which is the part this projection does not need.
type MgmtFaultResponse record {
    string errorMessage?;
    string faultStackTrace?;
};
