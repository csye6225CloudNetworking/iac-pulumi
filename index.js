const pulumi = require("@pulumi/pulumi");
const aws = require("@pulumi/aws");
const logFile = 'pulumi_log.txt';
const awsRoute53 = require("@pulumi/aws/route53");
const fs = require('fs');
// Function to log to both console and the log file
function logMessage(message) {
    console.log(message);
    fs.appendFileSync(logFile, message + '\n');
}

// Log a message to the console and log file
logMessage("This is a log message.");
const config = new pulumi.Config();


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


const destinationCidr = config.require("destinationCidr");
const public_route_association = config.require("public-route-association");
const private_route_association = config.require("private-route-association");
const privateSta = config.require("private");

const public_Subnet = config.require("publicsubnet");
const private_Subnet = config.require("privatesubnet");

const public_rt = config.require("public-rt");
const private_rt = config.require("private-rt");
const public_Route = config.require("publicRoute");




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

    

    /* const ami = aws.ec2.Ami.get("customAmi", {
        owners: ["454063085085"], // Replace with the owner account ID
        mostRecent: true,
        filters: [  
            {
                name: "root-device-type",
                values: ["ebs"],
            },
            {
                name: "architecture",
                values: ["x86_64"],
            },
            {
                name: "virtualization-type",
                values: ["hvm"],
            },
            {
                name: "platform-details",
                values: ["Linux/UNIX"],
            },
            {
                name: "state",
                values: ["available"],
            },
        ],
    }); */

  /*   ami.then(result=> logMessage(result[0]));
 logMessage(ami); */
    // Create an Application Security Group

    const applicationSecurityGroup = new aws.ec2.SecurityGroup("applicationSecurityGroup", {
        description: "Application Security Group for web applications",
        vpcId: vpc.id, // Replace with your VPC ID
        ingress: [
            {
              fromPort: 22,
              toPort: 22,
              protocol: "tcp",
              cidrBlocks: ["0.0.0.0/0"], // Allow SSH from anywhere
            },
            {
              fromPort: 80,
              toPort: 80,
              protocol: "tcp",
              cidrBlocks: ["0.0.0.0/0"], // Allow HTTP from anywhere
            },
            {
              fromPort: 443,
              toPort: 443,
              protocol: "tcp",
              cidrBlocks: ["0.0.0.0/0"], // Allow HTTPS from anywhere
            },
            {
              fromPort: 8080,
              toPort: 8080,
              protocol: "tcp",
              cidrBlocks: ["0.0.0.0/0"], // Allow your application traffic from anywhere
            },
          ],
          egress: [
            {
              fromPort: 3306,      // Allow outbound traffic on port 3306
              toPort: 3306,        // Allow outbound traffic on port 3306
              protocol: "tcp",     // TCP protocol
              cidrBlocks: ["0.0.0.0/0"],  // Allow all destinations
            },
         
          ],
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




const dbparametergroup = new aws.rds.ParameterGroup('dbparametergroup', {
    family: 'mysql8.0', 
    parameters: [
        {
            name: 'max_connections',
            value: '100',
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
  

    const cloudwatchAgentPolicy = new aws.iam.Policy("cloudwatchAgentPolicy", {
        description: "Policy for CloudWatch Agent",
        policy: {
            Version: "2012-10-17",
            Statement: [
                {
                    Action: [
                        "cloudwatch:PutMetricData",
                        "ec2:DescribeVolumes",
                        "ec2:DescribeTags",
                        "logs:DescribeLogStream",
                        "logs:DescribeLogGroups",
                        "logs:CreateLogGroup",
                        "logs:CreateLogStream",
                        "logs:PutLogEvents",
                    ],
                    Effect: "Allow",
                    Resource: "*",
                },
            ],
        },
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
    policyArn: cloudwatchAgentPolicy.arn,
    role: iamRole.name,
});

const instanceProfile = new aws.iam.InstanceProfile(
    "instanceProfileName", {
    role: iamRole.name,
   
});


   
    const ec2Instance = new aws.ec2.Instance("myEC2Instance", {
        instanceType: instanceType,
        ami: fetchAmi(),    
        userDataReplaceOnChange:true,
        iamInstanceProfile:instanceProfile,
        userData: pulumi.interpolate  `#!/bin/bash
        wget https://s3.amazonaws.com/amazoncloudwatch-agent/amazon_linux/amd64/latest/amazon-cloudwatch-agent.rpm
        sudo rpm -U amazon-cloudwatch-agent.rpm

        # Configure the CloudWatch Agent
        sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-config-wizard -m onPremise
        sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -s -c file:/opt/aws/amazon-cloudwatch-agent/bin/config.json

        # Start the CloudWatch Agent
        sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -m ec2 -a start

        cd /home/admin/
        chmod +w .env
        file_to_edit=".env"  
        new_mysql_database=${rdsinstance.dbName}
        new_mysql_user=${rdsinstance.username}
        new_mysql_password=${rdsinstance.password}
        new_mysql_port=${rdsinstance.port}
        new_mysql_host=${rdsinstance.address}
        new_db_dialect=${rdsinstance.engine}
        
        if [ -f "$file_to_edit" ]; then
           
        > "$file_to_edit"
        
            # Add new key-value pairs
            echo "MYSQL_DATABASE=$new_mysql_database" >> "$file_to_edit"
            echo "MYSQL_USER=$new_mysql_user" >> "$file_to_edit"
            echo "MYSQL_PASSWORD=$new_mysql_password" >> "$file_to_edit"
            echo "MYSQL_PORT=$new_mysql_port" >> "$file_to_edit"
            echo "MYSQL_HOST=$new_mysql_host" >> "$file_to_edit"
            echo "DB_DIALECT=$new_db_dialect" >> "$file_to_edit"
        
            echo "Cleared old data in $file_to_edit and added new key-value pairs."
        else
            echo "File $file_to_edit does not exist."   
        fi
        sudo systemctl daemon-reload
        sudo systemctl enable app.service
        sudo systemctl start app.service
        sudo chown -R csye6225:csye6225 /home/admin/*
        sudo chmod -R 750 /home/admin/*
        `.apply(s => s.trim()),
        keyName: sshKey.keyName,
        dependsOn: rdsinstance,
        vpcSecurityGroupIds: [applicationSecurityGroup.id], // Attach the Application Security Group created in the previous step
        subnetId: publicSubnets[0].id, // Replace with the subnet ID where you want to launch the EC2 instance
        rootBlockDevice: {
            volumeSize: 30, // Size of the root EBS volume (in GB)
            deleteOnTermination: true, // Automatically delete the root EBS volume when the EC2 instance is terminated
        },
        tags: {
            Name: "MyEC2Instance", 
        },
    });

    //const baseDomainName = config.require("basedomain"); 
    const baseDomainName = "dev.cloudcsye.me";
    const zonePromise = aws.route53.getZone({ name: baseDomainName }, { async: true });

    zonePromise.then(zone => {

    const record = new aws.route53.Record("myRecord", {
    zoneId: zone.zoneId, 
    name: "",
    type: "A",
    ttl: 60,
    records: [ec2Instance.publicIp],
}, { dependsOn: [ec2Instance] });   
});

});