const pulumi = require("@pulumi/pulumi");
const aws = require("@pulumi/aws");

const logFile = 'pulumi_log.txt';
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

            cidrBlock: calculateCidrBlock(i,`${publicSta}`),
 main
            availabilityZone: az,
            mapPublicIpOnLaunch: true,
            tags: {
                Name: `${public_Subnet}`,
            },
        });

        const privateSubnet = new aws.ec2.Subnet(`${private_Subnet}-${az}-${i}`, {
            vpcId: vpc.id,

            cidrBlock: calculateCidrBlock(i, `${privateSta}`),

            cidrBlock: calculateCidrBlock(i,`${privateSta}`),

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

    // Associate the public subnets with the public route table
    publicSubnets.forEach((subnet,i) => {
        new aws.ec2.RouteTableAssociation(`${public_route_association}-${subnet.availabilityZone}-${i}`, {
            subnetId: subnet.id,
            routeTableId: publicRouteTable.id,
            tags:{

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

    privateSubnets.forEach((subnet,i) => {
        new aws.ec2.RouteTableAssociation(`${private_route_association}-${subnet.availabilityZone}-${i}`, {
            subnetId: subnet.id,
            routeTableId: privateRouteTable.id,
            tags:{

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
                protocol: "tcp",
                fromPort: 22,  // SSH
                toPort: 22,
                cidrBlocks: ["0.0.0.0/0"], // Allow SSH from anywhere
            },
            {
                protocol: "tcp",
                fromPort: 80,  // HTTP
                toPort: 80,
                cidrBlocks: ["0.0.0.0/0"], // Allow HTTP from anywhere
            },
            {
                protocol: "tcp",
                fromPort: 443, // HTTPS
                toPort: 443,
                cidrBlocks: ["0.0.0.0/0"], // Allow HTTPS from anywhere
            },
            {
                protocol: "tcp",
                fromPort: 8080, // Replace with your application port
                toPort: 8080,
                cidrBlocks: ["0.0.0.0/0"], // Allow your application traffic from anywhere
            },
        ],
    });

    const instanceType = "t2.micro"; // Replace with your desired instance type
   // const ami = "ami-0fe212c33758905ab"; // Replace with the desired AMI ID
   
    const keyName = "ec2-key"; // Replace with your EC2 key pair name
    const sshKey = new aws.ec2.KeyPair("mySshKey", {
        keyName: keyName,
        //publicKey: "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQDD2rvVnzmnagrWL2uVvRacH4/v45g7CCU7ZGgvZ1vgX2ZdoUBwsmVcrd0kFioimKQpbFnIEY4sTZthCz9LUEACeSb157nb3PDysvjGomlGCGlG4qaaI/l3/0gWxxoz7PUHTEenborGwjOdn8YJnMshbf7410MOqTdzyx/7M3DIIZVH+qWuKJy8KP/q+jym7MV1QzwikqqJeTv15nHme5UgGp68zXxi9u5s6sIB/kQUSxXOmfj9nk9lSgxKXNVH/9nmhreuR8WbY4WOWNPyhMphBYvfn6UZCK1wrfinJ0nUNqHOWfzKAa0DpBgrabq8QuALIcOTXuXUuSbI1EjVSprtKJE1onFEZfXhlcBpEq2utz88JlxbHG7Jyvk7ciEfPKdGax1qIl9GxejKm0mOJrzQymqhxNgZq7NYGaKlL3DQw3MirY7LHfZsOvRlXjuBFHMiF/RvrrWx88rwfH0XywkbRCC+iWy87NNuu/cvm7muFCVN+TUpO0pj0VvSFSIa99s= rutuj@HP", // Replace with your public SSH key content
        publicKey: "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQCgczCeN4L3ebjxb1Gx3V1LMwCPT3ScEu+vSKKuxQGCpfw1jwKUOzO2iXwN2hQLO1aiC38ISCwZyUuNlMcU1biv4oDfZBoQ+10Mwl5dwtcMNr+UATr9nZPimOvKLNyPMFZKTO8FMf1aGIhSTE4zvSYzfIcv+Bzx0Xzg/OQbfpktWUSou675P8EkBlwzYEZe+o55Lmz76yeP3l6Tu/uhfiJO6NpDr/cUEwpg+Thv7bTd8dfii4qb+FhuGCOhaZNcv5xSiF14jI8XQ8bB55WLDfg9+B1WJgkM3OSCiBReBHRlFZsaTXp5TKCCPIA543ZjvtRVCouhk55E69X1cxK3dzku3THTa1q4i81Ew9IO9GrtFftRPCZOYixDtJHhtdk+e8ByLZHPYIAayQKZ7EQJzX4abNl/oqcYuQKx4hkH1qppjqJcsVq6Mg4uOC7yyxZhljiysEvpo8KvlWZ5CwX8ucR64Pg6ezkqi6oxQFZIpkp+8VP558+YEUww9ZS+lHtWO90= rutuj@HP",
        /* userData: `
        #!/bin/bash
        amazon-linux-extras install nginx1
        amazon-linux-extras install nginx
        systemctl enable nginx
        systemctl start nginx
        `, */
        userData: `
        #!/bin/bash
        "cd /webapp",
        "npm install",
        `,

    });
    // Define the EC2 instance

   
    const ec2Instance = new aws.ec2.Instance("myEC2Instance", {
        instanceType: instanceType,
        ami: fetchAmi(),

        keyName: sshKey.keyName,
        vpcSecurityGroupIds: [applicationSecurityGroup.id], // Attach the Application Security Group created in the previous step
        subnetId: publicSubnets[0].id, // Replace with the subnet ID where you want to launch the EC2 instance
        rootBlockDevice: {
            volumeSize: 30, // Size of the root EBS volume (in GB)
            deleteOnTermination: true, // Automatically delete the root EBS volume when the EC2 instance is terminated
        },
        tags: {
            Name: "MyEC2Instance", // Replace with a suitable name
        },
    });






});