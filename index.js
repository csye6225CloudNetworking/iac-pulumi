const pulumi = require("@pulumi/pulumi");
const aws = require("@pulumi/aws");
const config = new pulumi.Config();
const axios = require('axios');
const gcp = require("@pulumi/gcp");

const availabilityZoneCount = config.getNumber("availabilityZoneCount");
const vpcCidrBlock = config.require("vpcCidrBlock");
const cidrBlock = config.require("cidrBlock");
const publicSubnets = [];
const privateSubnets = [];


const subnetSuffix = config.require("subnetSuffix");

const state = config.require("state");
const vpcName = config.require("vpcName");
const igwName = config.require("igwName");
const publicSta = config.require("public");
const gcpProject = config.require("gcpName");


const destinationCidr = config.require("destinationCidr");
const public_route_association = config.require("public-route-association");
const private_route_association = config.require("private-route-association");
const privateSta = config.require("private");

const public_Subnet = config.require("publicsubnet");
const private_Subnet = config.require("privatesubnet");

const public_rt = config.require("public-rt");
const private_rt = config.require("private-rt");
const public_Route = config.require("publicRoute");
const mailgunApiKey = config.require("mailgun_api");
const domaninName = config.require("domainName")

// Define a function to get the first N availability zones
function getFirstNAvailabilityZones(data, n) {
    const availableAZCount = data.names.length;

    if (availableAZCount >= n) {
        return data.names.slice(0, n);
    }
    else {
        return data.names;
    }
}

async function fetchAmi(){
    const ami = await aws.ec2.getAmi({
        owners: ["454063085085"], 
        mostRecent: true,
        filters: [  
            {
                name: "root-device-type",
                values: ["ebs"],
            },
            {
                name: "state",
                values: ["available"],
            },
        ],

    })
    return ami.id

    
}

const availabilityZoneNames = []; // Initialize an array to store availability zone names

aws.getAvailabilityZones({ state: `${state}` }).then(data => {
    const availabilityZones = getFirstNAvailabilityZones(data, availabilityZoneCount); // Choose the first 3 AZs if available AZs are greater than 3
    
    const vpc = new aws.ec2.Vpc(`${vpcName}`, {
        cidrBlock: `${vpcCidrBlock}`,
        availabilityZones: availabilityZones,
        enableDnsHostnames: true,
    });
    const internetGateway = new aws.ec2.InternetGateway(`${igwName}`, {
        vpcId: vpc.id, // Associate the Internet Gateway with the VPC
    });

    for (let i = 0; i < availabilityZones.length; i++) {
        const az = availabilityZones[i];
        availabilityZoneNames.push(az);
    }
    const calculateCidrBlock = (index, subnetType) => {
        const subnetNumber = subnetType === `${publicSta}` ? index : index + availabilityZoneCount;
        return `${cidrBlock}.${subnetNumber}${subnetSuffix}`;
    };

    // Create subnets within each availability zone
    for (let i = 0; i < availabilityZoneNames.length; i++) {
        const az = availabilityZoneNames[i];

        // Create public and private subnets using aws.ec2.Subnet
        const publicSubnet = new aws.ec2.Subnet(`${public_Subnet}-${az}-${i}`, {
            vpcId: vpc.id,
            cidrBlock: calculateCidrBlock(i, `${publicSta}`),
            availabilityZone: az,
            mapPublicIpOnLaunch: true,
            tags: {
                Name: `${public_Subnet}`,
            },
        });

        const privateSubnet = new aws.ec2.Subnet(`${private_Subnet}-${az}-${i}`, {
            vpcId: vpc.id,
            cidrBlock: calculateCidrBlock(i, `${privateSta}`),
            availabilityZone: az,
            tags: {
                Name: `${private_Subnet}`,
            },
        });

        publicSubnets.push(publicSubnet);
        privateSubnets.push(privateSubnet);
    }

    const publicRouteTable = new aws.ec2.RouteTable(`${public_rt}`, {
        vpcId: vpc.id,
        tags: {
            Name: `${public_rt}`,
        },
    });

    const privateRouteTable = new aws.ec2.RouteTable(`${private_rt}`, {
        vpcId: vpc.id,
        tags: {
            Name: `${private_rt}`,
        },
    });
    const publicRoute = new aws.ec2.Route(`${public_Route}`, {
        routeTableId: publicRouteTable.id,
        destinationCidrBlock: `${destinationCidr}`,
        gatewayId: internetGateway.id,
    });

  

    // Associate the public subnets with the public route table
    publicSubnets.forEach((subnet, i) => {
        new aws.ec2.RouteTableAssociation(`${public_route_association}-${subnet.availabilityZone}-${i}`, {
            subnetId: subnet.id,
            routeTableId: publicRouteTable.id,
            tags: {
                Name: `${public_route_association}`,
            },
        });
    });
    
     // Create an IAM role and attach the CloudWatch Agent policy
     const iamRole = new aws.iam.Role("CloudWatchAgentRole", {
        assumeRolePolicy: JSON.stringify({
            Version: "2012-10-17",
            Statement: [
                {
                    Action: "sts:AssumeRole",
                    Effect: "Allow",
                    Principal: {
                        Service: "ec2.amazonaws.com",
                    },
                },
            ],
        }),
    });

    // Attach the CloudWatch Agent policy to the IAM role
const rolePolicyAttachment = new aws.iam.RolePolicyAttachment("cloudwatchAgentPolicyAttachment", {
    policyArn: "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy",
    role: iamRole.name,
});

const instanceProfile = new aws.iam.InstanceProfile(
    "instanceProfileName", {
    role: iamRole.name,
    dependsOn: [rolePolicyAttachment]   
});

// Add an additional inline policy for SNS
const snsPolicy = new aws.iam.RolePolicy("snsPolicy", {
    name:"snsPolicy",
    role: iamRole.name,
    policy: {
        Version: "2012-10-17",
        Statement: [
            {
                Effect: "Allow",
                "Action": [
                    "sns:Publish",
                    "sns:ListTopics"
                  ],
                Resource: "*",
            },
        ],
    },
});

const loadBalancerSecurityGroup = new aws.ec2.SecurityGroup("loadBalancerSecurityGroup", {
    description: "Security group for the load balancer",
    vpcId: vpc.id,
    ingress: [
        {
            fromPort: 80,
            toPort: 80,
            protocol: "tcp",
            cidrBlocks: ["0.0.0.0/0"], // Allow HTTP traffic from anywhere
        },
     /*    {
            fromPort: 22,
            toPort: 22,
            protocol: "tcp",
            cidrBlocks: ["0.0.0.0/0"], // Allow HTTP traffic from anywhere
        }, */
        {
            fromPort: 443,
            toPort: 443,
            protocol: "tcp",
            cidrBlocks: ["0.0.0.0/0"], // Allow HTTPS traffic from anywhere
        }
    ],
    egress: [
        {
            fromPort: 0,
            toPort: 0,
            protocol: "-1", // Allow all outbound traffic
            cidrBlocks: ["0.0.0.0/0"],
        },
    ],
    tags: {
        Name: "load-balancer-sg",
    },
});

    // Associate the private subnets with the private route table
    privateSubnets.forEach((subnet, i) => {
        new aws.ec2.RouteTableAssociation(`${private_route_association}-${subnet.availabilityZone}-${i}`, {
            subnetId: subnet.id,
            routeTableId: privateRouteTable.id,
            tags: {
                Name: `${private_route_association}`,
            },
        });
    });

    const dbparametergroup = new aws.rds.ParameterGroup('dbparametergroup', {
        family: 'mysql8.0', 
        parameters: [
            {
                name: 'max_connections',
                value: '100',
            },
        ],
    });

    const applicationSecurityGroup = new aws.ec2.SecurityGroup("applicationSecurityGroup", {
        description: "Application Security Group for web applications",
        vpcId: vpc.id, // Replace with your VPC ID
        ingress: [
            {
                fromPort: 22,
                toPort: 22,
                protocol: "tcp",
                cidrBlocks: ["0.0.0.0/0"],
                //securityGroups: [loadBalancerSecurityGroup.id],
            },
            {
                fromPort: 8080, // Update with the port your application listens on
                toPort: 8080,
                protocol: "tcp",
                cidrBlocks: ["0.0.0.0/0"],
                securityGroups: [loadBalancerSecurityGroup.id], // Allow application traffic only from the load balancer
            },
          ],
          egress: [

            {
                fromPort: 0,      // Allow outbound traffic on port 3306
                toPort: 0,        // Allow outbound traffic on port 3306
                protocol: "-1",     // TCP protocol
                cidrBlocks: ["0.0.0.0/0"],  // Allow all destinations
              },
         
          ],
          tags: {
            Name: "ec2-rds-1",
        },
    });

    const databaseSecurityGroup = new aws.ec2.SecurityGroup('databaseSecurityGroup', {
        description: 'Security group for RDS instances',
        vpcId: vpc.id, 
        ingress: [
            {
                fromPort: 3306, 
                toPort: 3306,
                protocol: "tcp",
                securityGroups: [applicationSecurityGroup.id], 
            },
        ],
        egress: [
            {
                fromPort: 0,
                toPort: 0,
                protocol: "-1",
                cidrBlocks: ["0.0.0.0/0"],
            },
        ],
        
    });

    const privateSubnetIds = privateSubnets.map(subnet => subnet.id);
const privateSubnetGroup = new aws.rds.SubnetGroup("privateSubnetGroup", {
    subnetIds: privateSubnetIds, 
    name: "my-private-subnet-group", 
    description: "Private subnet group for RDS",
});

const rdsinstance = new aws.rds.Instance('rdsinstance', {
    allocatedStorage: 20,
    engine: 'mysql', 
    instanceClass: 'db.t2.micro', 
    multiAz: false,
    name: 'csye6225',
    username: 'csye6225',
    password: 'rdsuser6367', 
    parameterGroupName: dbparametergroup,
    skipFinalSnapshot: true, 
    vpcSecurityGroupIds: [databaseSecurityGroup.id],
    dbSubnetGroupName: privateSubnetGroup.name, // private
    publiclyAccessible: false,
});

    const instanceType = "t2.micro"; 
   // const ami = "ami-0fe212c33758905ab"; // Replace with the desired AMI ID
   
    const keyName = "ec2-key"; // Replace with your EC2 key pair name
    const sshKey = new aws.ec2.KeyPair("mySshKey", {
        keyName: keyName,
        //publicKey: "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQDD2rvVnzmnagrWL2uVvRacH4/v45g7CCU7ZGgvZ1vgX2ZdoUBwsmVcrd0kFioimKQpbFnIEY4sTZthCz9LUEACeSb157nb3PDysvjGomlGCGlG4qaaI/l3/0gWxxoz7PUHTEenborGwjOdn8YJnMshbf7410MOqTdzyx/7M3DIIZVH+qWuKJy8KP/q+jym7MV1QzwikqqJeTv15nHme5UgGp68zXxi9u5s6sIB/kQUSxXOmfj9nk9lSgxKXNVH/9nmhreuR8WbY4WOWNPyhMphBYvfn6UZCK1wrfinJ0nUNqHOWfzKAa0DpBgrabq8QuALIcOTXuXUuSbI1EjVSprtKJE1onFEZfXhlcBpEq2utz88JlxbHG7Jyvk7ciEfPKdGax1qIl9GxejKm0mOJrzQymqhxNgZq7NYGaKlL3DQw3MirY7LHfZsOvRlXjuBFHMiF/RvrrWx88rwfH0XywkbRCC+iWy87NNuu/cvm7muFCVN+TUpO0pj0VvSFSIa99s= rutuj@HP", // Replace with your public SSH key content
        publicKey: "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQCgczCeN4L3ebjxb1Gx3V1LMwCPT3ScEu+vSKKuxQGCpfw1jwKUOzO2iXwN2hQLO1aiC38ISCwZyUuNlMcU1biv4oDfZBoQ+10Mwl5dwtcMNr+UATr9nZPimOvKLNyPMFZKTO8FMf1aGIhSTE4zvSYzfIcv+Bzx0Xzg/OQbfpktWUSou675P8EkBlwzYEZe+o55Lmz76yeP3l6Tu/uhfiJO6NpDr/cUEwpg+Thv7bTd8dfii4qb+FhuGCOhaZNcv5xSiF14jI8XQ8bB55WLDfg9+B1WJgkM3OSCiBReBHRlFZsaTXp5TKCCPIA543ZjvtRVCouhk55E69X1cxK3dzku3THTa1q4i81Ew9IO9GrtFftRPCZOYixDtJHhtdk+e8ByLZHPYIAayQKZ7EQJzX4abNl/oqcYuQKx4hkH1qppjqJcsVq6Mg4uOC7yyxZhljiysEvpo8KvlWZ5CwX8ucR64Pg6ezkqi6oxQFZIpkp+8VP558+YEUww9ZS+lHtWO90= rutuj@HP",
      
    });
          // Create an SNS topic
const snsTopic = new aws.sns.Topic("githubReleaseTopic");


    const userData =  pulumi.interpolate`#!/bin/bash
    cd /home/admin/
    chmod +w .env
    file_to_edit=".env"
    new_mysql_database=${rdsinstance.dbName}
    new_mysql_user=${rdsinstance.username}
    new_mysql_password=${rdsinstance.password}
    new_mysql_port=${rdsinstance.port}
    new_mysql_host=${rdsinstance.address}
    new_db_dialect=${rdsinstance.engine}
    
    
    sns_arn=${snsTopic.arn}
   
    
    if [ -f "$file_to_edit" ]; then
       
    > "$file_to_edit"
    
        # Add new key-value pairs
        echo "MYSQL_DATABASE=$new_mysql_database" >> "$file_to_edit"
        echo "MYSQL_USER=$new_mysql_user" >> "$file_to_edit"
        echo "MYSQL_PASSWORD=$new_mysql_password" >> "$file_to_edit"
        echo "MYSQL_PORT=$new_mysql_port" >> "$file_to_edit"
        echo "MYSQL_HOST=$new_mysql_host" >> "$file_to_edit"
        echo "DB_DIALECT=$new_db_dialect" >> "$file_to_edit"
        echo "AWS_REGION=us-east-1" >> "$file_to_edit"
        echo "SNS_ARN=$sns_arn" >> "$file_to_edit"

    
        echo "Cleared old data in $file_to_edit and added new key-value pairs."
    else
        echo "File $file_to_edit does not exist."   
    fi
    sudo systemctl daemon-reload
    sudo systemctl enable app.service
    sudo systemctl start app.service
    sudo chown -R csye6225:csye6225 /home/admin/*
    sudo chmod -R 750 /home/admin/*
    # Configure the CloudWatch Agent
    sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
        -a fetch-config \
        -m ec2 \
        -c file:/opt/cloudwatch-config.json \
        -s

    # Start the CloudWatch Agent
    sudo systemctl enable amazon-cloudwatch-agent
    sudo systemctl start amazon-cloudwatch-agent`;

    const base64Script = userData.apply(Script=>Buffer.from(Script).toString('base64'));
    
    const cloudWatchLogsPolicy = new aws.iam.Policy("cloudWatchLogsPolicy", {
        name: "CloudWatchLogsPolicy",
        description: "Policy for accessing CloudWatch Logs",
        policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: [
                "logs:CreateLogGroup",
                "logs:CreateLogStream",
                "logs:PutLogEvents",
                "logs:DescribeLogGroups",
                "logs:DescribeLogStreams",
              ],
              Resource: "*",
            },
          ],
        }),
      });
      const bucketName = "bucket-rutuja-new";
      const bucket = new gcp.storage.Bucket("myBucket", {
          name: bucketName,
          location: "us-east1", 
      });
      const serviceAccount = new gcp.serviceaccount.Account("myServiceAccount", {
        accountId: "my-service-account",
        project: gcpProject,
    });
    
    const credentials = pulumi.output(gcp.serviceaccount.getAccountKey({
        accountEmail: serviceAccount.email,
        project: gcpProject,
    }));
    
    const serviceAccountKeyJson = credentials.apply(credentials => JSON.stringify(credentials, null, 2));
    
  // Create a DynamoDB table
  const dynamoTable = new aws.dynamodb.Table("myDynamoTable", {
      attributes: [{
          name: "id",
          type: "S",
      }],
      hashKey: "id",
      billingMode: "PAY_PER_REQUEST", // or "PROVISIONED" if you want to specify capacity
  });
      
      const lambdaRole = new aws.iam.Role("lambdaRole", {
        assumeRolePolicy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: {
                Service: "lambda.amazonaws.com", // Specify the AWS service that can assume the role
              },
              Action: [
                "sts:AssumeRole",
              ],
            },
          ],
        }),
      });
      
      const lambdaRolePolicyAttachment = new aws.iam.RolePolicyAttachment("lambdaRolePolicyAttachment", {
        policyArn: cloudWatchLogsPolicy.arn,
        role: lambdaRole.name,
      });

const snsPublishPolicy = new aws.iam.RolePolicy("snsPublishPolicy", {
    role: lambdaRole.name,
    policy: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: "sns:Publish",
          Resource: "arn:aws:sns:us-east-1:454063085085:githubReleaseTopic",
        },
      ],
    }),
  });
  const dynamoDBPutItemPolicy = new aws.iam.RolePolicy("dynamoDBPutItemPolicy", {
    role: lambdaRole.name,
    policy: dynamoTable.arn.apply(arn => JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: "dynamodb:PutItem",
            Resource: arn,
          },
        ],
      })),
    });



  
const lambdaFunction = new aws.lambda.Function("webapp-lambda-function", {
       
    runtime: "nodejs18.x",
    code: new pulumi.asset.AssetArchive({
        ".": new pulumi.asset.FileArchive("C:/NORTHEASTERN_MASTERS/FALL'23/CLOUD/ASSIGNMENT/ASSIGNMENT_9/serverless/fork_serverless/index.zip"),
    }),
    handler: "index.handler",
    packageType: "Zip",
    role: lambdaRole.arn,
    environment: {
        variables: {
            GOOGLE_ACCESS_KEY: serviceAccountKeyJson,
            BUCKET_NAME: bucket.name,
            SNS_TOPIC_ARN: snsTopic.arn, // Pass the SNS topic ARN as an environment variable to the Lambda function
            apiKey: mailgunApiKey ,
            domain: domaninName,
            dynamoTable: dynamoTable.name,
        },
    },
});

 // Subscribe Lambda function to SNS topic
 const snsSubscription = new aws.sns.TopicSubscription("githubReleaseSubscription", {
    protocol: "lambda",
    endpoint: lambdaFunction.arn,
    topic: snsTopic.arn,
});

new aws.lambda.Permission("lambdaPermission", {
    action: "lambda:InvokeFunction",
    function: lambdaFunction.name,
    principal: "sns.amazonaws.com",
    sourceArn: snsTopic.arn,
});



    const launchConfig1 = new aws.ec2.LaunchTemplate("asgLaunchTemplate", {
        versionDescription: "Initial version",
        blockDeviceMappings: [{
            deviceName: "/dev/sda1",
            ebs: {
                volumeSize: 30,
            },
        }],
        networkInterfaces: [{
            associatePublicIpAddress: true,
            deviceIndex: 0,
            securityGroups: [applicationSecurityGroup.id],
            //subnetId:publicSubnets.id, // Replace with the subnet ID where you want to launch instances
        }],
        iamInstanceProfile: {
            name: instanceProfile.name,
        },
        imageId: fetchAmi(),
        instanceType: "t2.micro",
        keyName: sshKey.keyName,
        userData: base64Script,
        blockDeviceMappings: [
            {
                deviceName: "/dev/xvda",
                ebs: {
                    volumeSize: 25,
                    volumeType: "gp2",
                    deleteOnTermination: pulumi.interpolate`${true}`,
                },
            },
        ],
        disableApiTermination: false,
        tags: {
            Name: "webapp-LaunchTemplateinstance",
        },
        dependsOn: [rdsinstance,instanceProfile],

    });
      
const targetGroup = new aws.lb.TargetGroup("webAppTargetGroup", {
    port: 8080,
    protocol: "HTTP",
    vpcId: vpc.id,
    targetType: "instance",
    associatePublicIpAddress: true,
    healthCheck: {
        path: "/healthz",
        port:8080,
        protocol: "HTTP",

            healthyThreshold: 2,
            unhealthyThreshold: 2,
            timeout: 10,
            interval: 30,
       
    },
});

// Create an Application Load Balancer
const loadBalancer = new aws.lb.LoadBalancer("webAppLoadBalancer", {
    internal: false, 
    securityGroups: [loadBalancerSecurityGroup.id],
    subnets: publicSubnets.map(subnet => subnet.id),
}, { dependsOn: [launchConfig1,rdsinstance,targetGroup] });

const listener = new aws.lb.Listener("webAppListener", {
    loadBalancerArn: loadBalancer.arn,
    port: 80,
    protocol: "HTTP",
    defaultActions: [{
        type: "forward",
        targetGroupArn: targetGroup.arn,
    }],
  
});
const autoScalingGroup = new aws.autoscaling.Group("myAutoScalingGroup", {
    mixedInstancesPolicy: {
        launchTemplate: {
            launchTemplateSpecification: {
                launchTemplateName: launchConfig1.name,  
                version: "$Latest",  
            },
        },
        instancesDistribution: {        
        },
    },
    dependsOn: [targetGroup],
    targetGroupArns: [targetGroup.arn],
    vpcZoneIdentifiers: publicSubnets.map(subnet => subnet.id),
    minSize: 1,
    maxSize: 3,
    desiredCapacity: 1,
    healthCheckType: "EC2",
    healthCheckGracePeriod: 300,
    forceDelete: true,
    tags: [{
        key: "Name",
        value: "MyAutoScalingGroup",
        propagateAtLaunch: true,
    }],
});

const scaleUpPolicy = new aws.autoscaling.Policy("scaleUpPolicy", {
    scalingAdjustment: 1,
    adjustmentType: "ChangeInCapacity",
    cooldown: 60,
    autoscalingGroupName: autoScalingGroup.name,
    autocreationCooldown: 60,
    cooldownDescription: "Scale up policy when average CPU usage is above 5%",
    policyType: "SimpleScaling",
    scalingTargetId: autoScalingGroup.id,
});

const scaleDownPolicy = new aws.autoscaling.Policy("scaleDownPolicy", {
    scalingAdjustment: -1,
    adjustmentType: "ChangeInCapacity",
    cooldown: 60,
    autoscalingGroupName: autoScalingGroup.name,
    autocreationCooldown: 60,
    cooldownDescription:
          "Scale down policy when average CPU usage is below 3%",
        policyType: "SimpleScaling",
        scalingTargetId: autoScalingGroup.id,
});

const cpuUtilizationAlarmHigh = new aws.cloudwatch.MetricAlarm(
    "cpuUtilizationAlarmHigh",
    {
      comparisonOperator: "GreaterThanThreshold",
      evaluationPeriods: 1,
      metricName: "CPUUtilization",
      namespace: "AWS/EC2",
      period: 60,
      threshold: 5,
      statistic: "Average",
      alarmActions: [scaleUpPolicy.arn],
      dimensions: { AutoScalingGroupName: autoScalingGroup.name },
    }
  );

  const cpuUtilizationAlarmLow = new aws.cloudwatch.MetricAlarm(
    "cpuUtilizationAlarmLow",
    {
      comparisonOperator: "LessThanThreshold",
      evaluationPeriods: 1,
      metricName: "CPUUtilization",
      namespace: "AWS/EC2",
      period: 60,
      statistic: "Average",
      threshold: 3,
      alarmActions: [scaleDownPolicy.arn],
      dimensions: { AutoScalingGroupName: autoScalingGroup.name },
    }
  );




    const baseDomainName = "dev.cloudcsye.me";
    const zonePromise = aws.route53.getZone({ name: baseDomainName }, { async: true });
    //const dnsName = loadBalancer.dnsName.apply(name => name);
    zonePromise.then(zone => {

        const record = new aws.route53.Record("myRecord", {
        zoneId: zone.zoneId,
        name: "dev.cloudcsye.me",
        type: "A",
                aliases: [
            {
                name: loadBalancer.dnsName,
                zoneId: loadBalancer.zoneId,
                evaluateTargetHealth: true,
            },
        ],
    });  
    });

});